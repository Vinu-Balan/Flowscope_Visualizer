import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { AnalysisError, err, ok, type Result } from '@flowscope/core';
import type { ProjectScanResult, ScannedFile, ScannedJavaFile, SourceSet } from './scan-result';

const EXCLUDED_DIRECTORY_NAMES = new Set(['node_modules', 'target', 'build', 'out', 'dist', 'bin']);
const HASH_CONCURRENCY = 16;

function shouldSkipDirectory(name: string): boolean {
  return name.startsWith('.') || EXCLUDED_DIRECTORY_NAMES.has(name);
}

function toSegments(relativePath: string): string[] {
  return relativePath.split(sep).filter((segment) => segment.length > 0);
}

function toPosixPath(relativePath: string): string {
  return relativePath.split(sep).join('/');
}

function containsSubsequence(segments: readonly string[], subsequence: readonly string[]): boolean {
  for (let start = 0; start <= segments.length - subsequence.length; start += 1) {
    if (subsequence.every((part, offset) => segments[start + offset] === part)) {
      return true;
    }
  }
  return false;
}

function classifyJavaSourceSet(segments: readonly string[]): SourceSet {
  if (containsSubsequence(segments, ['src', 'main', 'java'])) {
    return 'main';
  }
  if (containsSubsequence(segments, ['src', 'test', 'java'])) {
    return 'test';
  }
  return 'other';
}

function isUnderResourcesDirectory(segments: readonly string[]): boolean {
  return (
    containsSubsequence(segments, ['src', 'main', 'resources']) ||
    containsSubsequence(segments, ['src', 'test', 'resources'])
  );
}

interface FileCandidate {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
}

interface JavaFileCandidate extends FileCandidate {
  readonly sourceSet: SourceSet;
}

interface WalkAccumulator {
  totalFilesScanned: number;
  totalDirectoriesSkipped: number;
  readonly javaCandidates: JavaFileCandidate[];
  readonly resourceCandidates: FileCandidate[];
}

async function walk(directory: string, projectRoot: string, acc: WalkAccumulator): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    // An unreadable subdirectory doesn't invalidate the whole scan — see
    // docs/architecture/analysis-pipeline.md's partial-failure resilience.
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) {
        acc.totalDirectoriesSkipped += 1;
        continue;
      }
      await walk(absolutePath, projectRoot, acc);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    acc.totalFilesScanned += 1;

    const relativePath = relative(projectRoot, absolutePath);
    const segments = toSegments(relativePath);

    let sizeBytes: number;
    try {
      sizeBytes = (await stat(absolutePath)).size;
    } catch {
      continue;
    }

    if (entry.name.endsWith('.java')) {
      acc.javaCandidates.push({
        absolutePath,
        relativePath: toPosixPath(relativePath),
        sizeBytes,
        sourceSet: classifyJavaSourceSet(segments),
      });
    } else if (isUnderResourcesDirectory(segments)) {
      acc.resourceCandidates.push({
        absolutePath,
        relativePath: toPosixPath(relativePath),
        sizeBytes,
      });
    }
  }
}

async function hashFile(absolutePath: string): Promise<string | undefined> {
  try {
    const content = await readFile(absolutePath);
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return undefined;
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      const item = items[currentIndex];
      if (item !== undefined) {
        results[currentIndex] = await fn(item);
      }
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Walks a validated project's file tree and reports the Java source and
 * resource files it finds (docs/sprints/SPRINT-3.md). Only fails if the
 * project root itself can't be read — an unreadable file or subdirectory
 * along the way is skipped, not fatal.
 */
export async function scanProject(
  projectPath: string,
): Promise<Result<ProjectScanResult, AnalysisError>> {
  const startedAt = Date.now();

  try {
    await readdir(projectPath);
  } catch (error) {
    return err(
      new AnalysisError({
        message: `Could not scan "${projectPath}" — it may have been moved or deleted since it was opened.`,
        cause: error,
        context: { projectPath },
      }),
    );
  }

  const acc: WalkAccumulator = {
    totalFilesScanned: 0,
    totalDirectoriesSkipped: 0,
    javaCandidates: [],
    resourceCandidates: [],
  };

  await walk(projectPath, projectPath, acc);

  const [javaHashes, resourceHashes] = await Promise.all([
    mapWithConcurrency(acc.javaCandidates, HASH_CONCURRENCY, (candidate) =>
      hashFile(candidate.absolutePath),
    ),
    mapWithConcurrency(acc.resourceCandidates, HASH_CONCURRENCY, (candidate) =>
      hashFile(candidate.absolutePath),
    ),
  ]);

  const javaFiles: ScannedJavaFile[] = [];
  acc.javaCandidates.forEach((candidate, index) => {
    const contentHash = javaHashes[index];
    if (contentHash) {
      javaFiles.push({
        path: candidate.relativePath,
        sizeBytes: candidate.sizeBytes,
        contentHash,
        sourceSet: candidate.sourceSet,
      });
    }
  });

  const resourceFiles: ScannedFile[] = [];
  acc.resourceCandidates.forEach((candidate, index) => {
    const contentHash = resourceHashes[index];
    if (contentHash) {
      resourceFiles.push({
        path: candidate.relativePath,
        sizeBytes: candidate.sizeBytes,
        contentHash,
      });
    }
  });

  return ok({
    projectPath,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totalFilesScanned: acc.totalFilesScanned,
    totalDirectoriesSkipped: acc.totalDirectoriesSkipped,
    javaFiles,
    resourceFiles,
  });
}
