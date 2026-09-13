import { IpcError } from '@flowscope/core';
import type { z } from 'zod';

/**
 * Validates a value against a zod schema, throwing a typed {@link IpcError}
 * on failure. Used on both sides of the boundary: the main process
 * validates inbound requests (and, defensively, its own outbound
 * responses) before they cross the wire; the renderer validates inbound
 * responses before trusting them (docs/adr/ADR-004-ipc-boundary.md).
 */
export function parseOrThrow<T>(
  schema: z.ZodType<T>,
  value: unknown,
  context: { readonly channel: string; readonly direction: 'request' | 'response' },
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new IpcError({
      message: `Invalid IPC ${context.direction} on channel "${context.channel}"`,
      context: { issues: result.error.issues.map((issue) => issue.message) },
    });
  }
  return result.data;
}
