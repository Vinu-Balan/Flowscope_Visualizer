// Imported from the isomorphic subpaths, not the package roots — both
// root barrels also export a Node-only implementation (node:fs), which
// must never end up in the preload/renderer bundle. See the comments atop
// packages/workspace/src/project.ts and packages/scanner/src/scan-result.ts.
import { ProjectScanResultSchema } from '@flowscope/scanner/scan-result';
import { ProjectValidationResultSchema } from '@flowscope/workspace/project';
import { z } from 'zod';

/**
 * Opens the native "select a project folder" dialog. It returns the
 * chosen directory only — no validation happens here, so a canceled
 * dialog and an unvalidated path both resolve quickly. Call
 * `project.validate` with the result to find out whether FlowScope can
 * actually work with it (docs/sprints/SPRINT-2.md).
 */
export const ProjectOpenRequestSchema = z.undefined();

export const ProjectOpenResponseSchema = z.discriminatedUnion('canceled', [
  z.object({ canceled: z.literal(true) }),
  z.object({ canceled: z.literal(false), path: z.string().min(1) }),
]);
export type ProjectOpenResponse = z.infer<typeof ProjectOpenResponseSchema>;

/**
 * Validates an arbitrary folder path — from the dialog above, or from a
 * previously-recorded recent project — as a Maven/Gradle project.
 */
export const ProjectValidateRequestSchema = z.object({ path: z.string().min(1) });
export const ProjectValidateResponseSchema = ProjectValidationResultSchema;

/**
 * Scans a validated project's file tree for Java source and resource
 * files (docs/sprints/SPRINT-3.md). Only fails (status: 'error') if the
 * project root itself can no longer be read.
 */
export const ProjectScanRequestSchema = z.object({ path: z.string().min(1) });

export const ProjectScanResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('success'), result: ProjectScanResultSchema }),
  z.object({ status: z.literal('error'), message: z.string().min(1) }),
]);
export type ProjectScanResponse = z.infer<typeof ProjectScanResponseSchema>;
