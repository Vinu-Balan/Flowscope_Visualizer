import { z } from 'zod';

/** A lightweight liveness/version check the renderer uses to confirm the main process is up. */
export const SystemPingRequestSchema = z.undefined();

export const SystemPingResponseSchema = z.object({
  pong: z.literal(true),
  appVersion: z.string().min(1),
  platform: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
});
export type SystemPingResponse = z.infer<typeof SystemPingResponseSchema>;
