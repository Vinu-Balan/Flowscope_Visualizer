import { z } from 'zod';

/**
 * A REST endpoint discovered by interpreting the Java Semantic Model's
 * annotations — Spring MVC (docs/sprints/SPRINT-4.md) or JAX-RS/Jersey
 * (docs/sprints/SPRINT-11.md), both commonly hosted inside a Spring Boot
 * app. Framework-specific on purpose — this is where that layer enters
 * the pipeline; nothing upstream of `packages/parser-spring` knows about
 * it (docs/ARCHITECTURE.md).
 *
 * This file has zero Node.js dependencies and is published as the
 * separate `@flowscope/parser-spring/api` entry point (see package.json
 * "exports"), the same split `@flowscope/config/settings`,
 * `@flowscope/workspace/project`, and `@flowscope/scanner/scan-result`
 * use and for the same reason: keep `node:fs` (and, here, the
 * `java-parser` dependency chain — see ADR-006) out of anything the
 * sandboxed preload script might import. Import from this subpath — not
 * the package root, which also exports the Node-only `discoverApis` —
 * anywhere that isn't guaranteed to run unsandboxed. See
 * `src/discover-apis.ts`.
 */

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export const HttpMethodSchema = z.enum(HTTP_METHODS);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const DiscoveredApiSchema = z.object({
  /** Stable within one discovery run: `${httpMethod} ${path}#${file}:${methodName}`. */
  id: z.string().min(1),
  httpMethod: HttpMethodSchema,
  path: z.string().min(1),
  className: z.string().min(1),
  methodName: z.string().min(1),
  /** Project-relative path, forward-slash-normalized (matches ScannedFile.path). */
  file: z.string().min(1),
  line: z.number().int().nonnegative(),
});
export type DiscoveredApi = z.infer<typeof DiscoveredApiSchema>;
