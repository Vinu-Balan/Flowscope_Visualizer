import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AnalysisError, err, mapWithConcurrency, ok, type Result } from '@flowscope/core';
import { parseJavaFile } from './parse-java-file';
import type { JavaSourceFile } from './java-model';

const PARSE_CONCURRENCY = 16;

export interface JavaProjectFile {
  readonly relativePath: string;
  readonly model: JavaSourceFile;
}

export interface ParseJavaFilesResult {
  /** Only the files that parsed successfully — see `parsedFileCount`/`failedFileCount` for the overall tally. */
  readonly files: readonly JavaProjectFile[];
  readonly parsedFileCount: number;
  readonly failedFileCount: number;
}

interface FileOutcome {
  readonly ok: boolean;
  readonly file?: JavaProjectFile;
}

async function parseOneFile(projectPath: string, relativePath: string): Promise<FileOutcome> {
  try {
    const content = await readFile(join(projectPath, relativePath), 'utf8');
    const parsed = parseJavaFile(content);
    if (!parsed.ok) {
      return { ok: false };
    }
    return { ok: true, file: { relativePath, model: parsed.value } };
  } catch {
    // An unreadable or otherwise-unparseable file is skipped, not fatal —
    // see docs/architecture/analysis-pipeline.md.
    return { ok: false };
  }
}

/**
 * Reads and parses every given Java file (project-relative paths, normally
 * the `main`/`other` source-set files from a prior `packages/scanner`
 * scan) into a project-wide Java Semantic Model index. Shared by
 * `packages/parser-spring`'s API discovery and
 * `packages/business-analyzer`'s flow inference, so a project's files are
 * parsed once per analysis request rather than twice
 * (`docs/CODING_GUIDELINES.md` — no duplicate utilities). Only fails
 * outright if the project root itself can no longer be read — same shape
 * as `packages/scanner`'s `scanProject`.
 */
export async function parseJavaFiles(
  projectPath: string,
  javaFileRelativePaths: readonly string[],
): Promise<Result<ParseJavaFilesResult, AnalysisError>> {
  try {
    await readdir(projectPath);
  } catch (error) {
    return err(
      new AnalysisError({
        message: `Could not parse Java files in "${projectPath}" — it may have been moved or deleted since it was opened.`,
        cause: error,
        context: { projectPath },
      }),
    );
  }

  const outcomes = await mapWithConcurrency(
    javaFileRelativePaths,
    PARSE_CONCURRENCY,
    (relativePath) => parseOneFile(projectPath, relativePath),
  );

  const files: JavaProjectFile[] = [];
  let parsedFileCount = 0;
  let failedFileCount = 0;
  for (const outcome of outcomes) {
    if (outcome.ok && outcome.file) {
      parsedFileCount += 1;
      files.push(outcome.file);
    } else {
      failedFileCount += 1;
    }
  }

  return ok({ files, parsedFileCount, failedFileCount });
}
