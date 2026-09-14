import type { AnalysisError, Result } from '@flowscope/core';
import { ok } from '@flowscope/core';
import { parseJavaFiles } from '@flowscope/parser-java';
import type { DiscoveredApi } from './api';
import { discoverApisInFile } from './discover-apis-in-file';

export interface DiscoverApisResult {
  readonly apis: readonly DiscoveredApi[];
  readonly parsedFileCount: number;
  readonly failedFileCount: number;
}

/**
 * Parses each given Java file (project-relative paths, normally the
 * `main`/`other` source-set files from a prior `packages/scanner` scan)
 * and discovers Spring MVC endpoints in them (docs/sprints/SPRINT-4.md).
 * Parsing itself — including the per-file resilience and the
 * project-root-unreadable failure case — is `packages/parser-java`'s
 * `parseJavaFiles`, shared with `packages/business-analyzer` so a
 * project's files aren't parsed twice per analysis
 * (`docs/CODING_GUIDELINES.md`).
 */
export async function discoverApis(
  projectPath: string,
  javaFileRelativePaths: readonly string[],
): Promise<Result<DiscoverApisResult, AnalysisError>> {
  const parsed = await parseJavaFiles(projectPath, javaFileRelativePaths);
  if (!parsed.ok) {
    return parsed;
  }

  const apis: DiscoveredApi[] = [];
  for (const file of parsed.value.files) {
    apis.push(...discoverApisInFile(file.model, file.relativePath));
  }

  return ok({
    apis,
    parsedFileCount: parsed.value.parsedFileCount,
    failedFileCount: parsed.value.failedFileCount,
  });
}
