import { z } from 'zod';

/**
 * Opens the native "select a project folder" dialog. Sprint 1 scope: it
 * returns the chosen directory only — project validation, scanning, and
 * analysis are later sprints (docs/sprints/SPRINT-1.md).
 */
export const ProjectOpenRequestSchema = z.undefined();

export const ProjectOpenResponseSchema = z.discriminatedUnion('canceled', [
  z.object({ canceled: z.literal(true) }),
  z.object({ canceled: z.literal(false), path: z.string().min(1) }),
]);
export type ProjectOpenResponse = z.infer<typeof ProjectOpenResponseSchema>;
