import { z } from 'zod';

/**
 * Project identity produced by validating a folder the user opened
 * (`docs/sprints/SPRINT-2.md`). Framework-independent on purpose — the
 * only two build systems detected today are Maven and Gradle, but nothing
 * here assumes Spring specifically (MASTER_PLAN.md §14).
 *
 * This file has zero Node.js dependencies and is published as the
 * separate `@flowscope/workspace/project` entry point (see package.json
 * "exports"), the same split `@flowscope/config/settings` uses and for
 * the same reason: keep `node:fs` out of anything the sandboxed preload
 * script might import. Import from this subpath — not the package root,
 * which also exports the Node-only `validateProject` — anywhere that
 * isn't guaranteed to run unsandboxed. See `src/validate-project.ts`.
 */

export const BUILD_SYSTEMS = ['maven', 'gradle'] as const;
export const BuildSystemSchema = z.enum(BUILD_SYSTEMS);
export type BuildSystem = z.infer<typeof BuildSystemSchema>;

export const ValidatedProjectSchema = z.object({
  /** The resolved, absolute project path — stable and unique, used as the identity. */
  id: z.string().min(1),
  path: z.string().min(1),
  /** Directory basename, shown in the UI until richer naming (e.g. pom.xml artifactId) lands. */
  name: z.string().min(1),
  buildSystem: BuildSystemSchema,
  /** The build file that triggered detection, relative to the project root (e.g. "pom.xml"). */
  buildFile: z.string().min(1),
  /**
   * A shallow, best-effort signal only — a text search for "spring-boot"
   * in the root build file. Never treated as certain (MASTER_PLAN.md §12);
   * a `false` here does not block opening the project, only warns.
   */
  looksLikeSpringBoot: z.boolean(),
});
export type ValidatedProject = z.infer<typeof ValidatedProjectSchema>;

export const PROJECT_VALIDATION_FAILURE_CODES = [
  'PROJECT_NOT_FOUND',
  'INVALID_PROJECT',
  'UNSUPPORTED_PROJECT',
] as const;
export const ProjectValidationFailureCodeSchema = z.enum(PROJECT_VALIDATION_FAILURE_CODES);
export type ProjectValidationFailureCode = z.infer<typeof ProjectValidationFailureCodeSchema>;

export const ProjectValidationResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('valid'), project: ValidatedProjectSchema }),
  z.object({
    status: z.literal('invalid'),
    code: ProjectValidationFailureCodeSchema,
    message: z.string().min(1),
  }),
]);
export type ProjectValidationResult = z.infer<typeof ProjectValidationResultSchema>;
