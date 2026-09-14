import { z } from 'zod';

/**
 * The result of scanning a validated project's file tree
 * (docs/sprints/SPRINT-3.md). Framework-independent — nothing here is
 * Spring-specific, only "Java source" vs. "resource" by directory
 * convention (MASTER_PLAN.md §8 features F/G).
 *
 * This file has zero Node.js dependencies and is published as the
 * separate `@flowscope/scanner/scan-result` entry point (see package.json
 * "exports"), the same split `@flowscope/config/settings` and
 * `@flowscope/workspace/project` use and for the same reason: keep
 * `node:fs` out of anything the sandboxed preload script might import.
 * Import from this subpath — not the package root, which also exports the
 * Node-only `scanProject` — anywhere that isn't guaranteed to run
 * unsandboxed. See `src/scan-project.ts`.
 */

export const SOURCE_SETS = ['main', 'test', 'other'] as const;
export const SourceSetSchema = z.enum(SOURCE_SETS);
export type SourceSet = z.infer<typeof SourceSetSchema>;

export const ScannedFileSchema = z.object({
  /** Project-relative, forward-slash-normalized path — stable across platforms. */
  path: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  /** sha256 of the file's content at scan time — captured for a future incremental-reanalysis pass (MASTER_PLAN.md §35); nothing reads it back yet. */
  contentHash: z.string().min(1),
});
export type ScannedFile = z.infer<typeof ScannedFileSchema>;

export const ScannedJavaFileSchema = ScannedFileSchema.extend({
  sourceSet: SourceSetSchema,
});
export type ScannedJavaFile = z.infer<typeof ScannedJavaFileSchema>;

export const ProjectScanResultSchema = z.object({
  projectPath: z.string().min(1),
  scannedAt: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  /** Every regular file the walk encountered, including ones that are neither Java source nor a resource. */
  totalFilesScanned: z.number().int().nonnegative(),
  /** Directories skipped by name (node_modules, target, build, dot-directories, ...) — informational only. */
  totalDirectoriesSkipped: z.number().int().nonnegative(),
  javaFiles: z.array(ScannedJavaFileSchema),
  resourceFiles: z.array(ScannedFileSchema),
});
export type ProjectScanResult = z.infer<typeof ProjectScanResultSchema>;

export interface ProjectScanSummary {
  readonly totalJavaFiles: number;
  readonly mainJavaFiles: number;
  readonly testJavaFiles: number;
  readonly otherJavaFiles: number;
  readonly totalResourceFiles: number;
}

/** A small derived summary — shared by tests and the renderer's sidebar so neither recomputes it independently. */
export function summarizeScan(result: ProjectScanResult): ProjectScanSummary {
  let mainJavaFiles = 0;
  let testJavaFiles = 0;
  let otherJavaFiles = 0;

  for (const file of result.javaFiles) {
    if (file.sourceSet === 'main') {
      mainJavaFiles += 1;
    } else if (file.sourceSet === 'test') {
      testJavaFiles += 1;
    } else {
      otherJavaFiles += 1;
    }
  }

  return {
    totalJavaFiles: result.javaFiles.length,
    mainJavaFiles,
    testJavaFiles,
    otherJavaFiles,
    totalResourceFiles: result.resourceFiles.length,
  };
}
