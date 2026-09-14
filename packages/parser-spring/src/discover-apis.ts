import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AnalysisError, err, mapWithConcurrency, ok, type Result } from '@flowscope/core';
import { parseJavaFile } from '@flowscope/parser-java';
import type { DiscoveredApi } from './api';
import { discoverApisInFile } from './discover-apis-in-file';

const PARSE_CONCURRENCY = 16;

export interface DiscoverApisResult {
  readonly apis: readonly DiscoveredApi[];
  readonly parsedFileCount: number;
  readonly failedFileCount: number;
}

interface FileOutcome {
  readonly ok: boolean;
  readonly apis: readonly DiscoveredApi[];
}

async function discoverApisInOneFile(
  projectPath: string,
  relativePath: string,
): Promise<FileOutcome> {
  try {
    const content = await readFile(join(projectPath, relativePath), 'utf8');
    const parsed = parseJavaFile(content);
    if (!parsed.ok) {
      return { ok: false, apis: [] };
    }
    return { ok: true, apis: discoverApisInFile(parsed.value, relativePath) };
  } catch {
    // An unreadable or otherwise-unparseable file is skipped, not fatal —
    // see docs/architecture/analysis-pipeline.md.
    return { ok: false, apis: [] };
  }
}

/**
 * Reads and parses each given Java file (project-relative paths, normally
 * the `main`/`other` source-set files from a prior packages/scanner scan)
 * and discovers Spring MVC endpoints in them (docs/sprints/SPRINT-4.md).
 * Only fails outright if the project root itself can no longer be read —
 * same shape as packages/scanner's `scanProject`.
 */
export async function discoverApis(
  projectPath: string,
  javaFileRelativePaths: readonly string[],
): Promise<Result<DiscoverApisResult, AnalysisError>> {
  try {
    await readdir(projectPath);
  } catch (error) {
    return err(
      new AnalysisError({
        message: `Could not discover APIs in "${projectPath}" — it may have been moved or deleted since it was opened.`,
        cause: error,
        context: { projectPath },
      }),
    );
  }

  const outcomes = await mapWithConcurrency(
    javaFileRelativePaths,
    PARSE_CONCURRENCY,
    (relativePath) => discoverApisInOneFile(projectPath, relativePath),
  );

  const apis: DiscoveredApi[] = [];
  let parsedFileCount = 0;
  let failedFileCount = 0;
  for (const outcome of outcomes) {
    if (outcome.ok) {
      parsedFileCount += 1;
    } else {
      failedFileCount += 1;
    }
    apis.push(...outcome.apis);
  }

  return ok({ apis, parsedFileCount, failedFileCount });
}
