// Imported from the isomorphic `/project` subpath, not the package root —
// the root barrel also exports the Node-only validateProject (node:fs),
// which must never end up in the preload/renderer bundle. See the comment
// atop packages/workspace/src/project.ts.
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
