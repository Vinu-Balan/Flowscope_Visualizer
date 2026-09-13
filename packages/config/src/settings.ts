import { z } from 'zod';

/**
 * Persisted FlowScope settings (MASTER_PLAN.md §28). Kept intentionally
 * small in Sprint 1 — theme, recent projects, and logging level — and
 * extended as later sprints need to persist more (graph layout, default
 * detail level, analysis behavior, cache behavior, shortcuts, exclusions).
 *
 * This file has zero Node.js dependencies on purpose and is published as
 * the separate `@flowscope/config/settings` entry point (see package.json
 * "exports"). Import from that subpath — not the package root — anywhere
 * that isn't guaranteed to run in an unrestricted Node context (the Electron
 * preload script in particular runs sandboxed and cannot resolve `node:fs`).
 * Importing the package root here would pull in SettingsStore's `node:fs`
 * usage transitively through the barrel, even for code that never calls it.
 */

export const THEME_PREFERENCES = ['dark', 'light', 'system'] as const;
export const ThemePreferenceSchema = z.enum(THEME_PREFERENCES);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export const LogLevelSchema = z.enum(LOG_LEVELS);
export type SettingsLogLevel = z.infer<typeof LogLevelSchema>;

export const MAX_RECENT_PROJECTS = 10;

export const SettingsSchema = z.object({
  schemaVersion: z.literal(1),
  theme: ThemePreferenceSchema,
  recentProjects: z.array(z.string().min(1)).max(MAX_RECENT_PROJECTS),
  logging: z.object({
    level: LogLevelSchema,
  }),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  theme: 'system',
  recentProjects: [],
  logging: { level: 'info' },
};

/** A partial patch accepted by `SettingsStore.update` — every field optional, still validated. */
export const SettingsUpdateSchema = z.object({
  theme: ThemePreferenceSchema.optional(),
  recentProjects: z.array(z.string().min(1)).max(MAX_RECENT_PROJECTS).optional(),
  logging: z
    .object({
      level: LogLevelSchema,
    })
    .partial()
    .optional(),
});

export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

/** Prepends a project path to the recent-projects list, de-duplicated and capped. */
export function withRecentProject(recentProjects: readonly string[], path: string): string[] {
  return [path, ...recentProjects.filter((existing) => existing !== path)].slice(
    0,
    MAX_RECENT_PROJECTS,
  );
}
