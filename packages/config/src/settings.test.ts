import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  SettingsUpdateSchema,
  withRecentProject,
} from './settings';

describe('SettingsSchema', () => {
  it('accepts the default settings', () => {
    expect(SettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });

  it('rejects an unknown theme', () => {
    const result = SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, theme: 'neon' });
    expect(result.success).toBe(false);
  });

  it('rejects more than the recent-projects cap', () => {
    const result = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      recentProjects: Array.from({ length: 11 }, (_, i) => `/project-${String(i)}`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a wrong schemaVersion', () => {
    const result = SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, schemaVersion: 2 });
    expect(result.success).toBe(false);
  });
});

describe('SettingsUpdateSchema', () => {
  it('accepts an empty patch', () => {
    expect(SettingsUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a partial logging patch', () => {
    expect(SettingsUpdateSchema.safeParse({ logging: { level: 'debug' } }).success).toBe(true);
  });

  it('rejects an invalid theme in a patch', () => {
    expect(SettingsUpdateSchema.safeParse({ theme: 'nope' }).success).toBe(false);
  });
});

describe('withRecentProject', () => {
  it('prepends a new project', () => {
    expect(withRecentProject([], '/a')).toEqual(['/a']);
  });

  it('de-duplicates by moving an existing project to the front', () => {
    expect(withRecentProject(['/a', '/b'], '/b')).toEqual(['/b', '/a']);
  });

  it('caps the list at MAX_RECENT_PROJECTS', () => {
    const existing = Array.from({ length: 10 }, (_, i) => `/project-${String(i)}`);
    const result = withRecentProject(existing, '/new');
    expect(result).toHaveLength(10);
    expect(result[0]).toBe('/new');
    expect(result).not.toContain('/project-9');
  });
});
