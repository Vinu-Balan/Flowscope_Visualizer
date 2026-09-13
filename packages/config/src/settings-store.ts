import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ConfigurationError, err, ok, type Result } from '@flowscope/core';
import type { Logger } from '@flowscope/logging';
import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  SettingsUpdateSchema,
  type Settings,
  type SettingsUpdate,
} from './settings';

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

/**
 * Loads, validates, and persists {@link Settings} as JSON on disk, with an
 * atomic write (temp file + rename) and defensive fallback to defaults on a
 * missing or corrupt file — settings must never crash the app on load.
 *
 * Deliberately takes a plain file path rather than importing Electron's
 * `app.getPath('userData')` itself, so it stays testable and reusable
 * outside Electron (docs/ARCHITECTURE.md).
 */
export class SettingsStore {
  private cached: Settings = DEFAULT_SETTINGS;

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {}

  /** The last loaded (or defaulted) settings, synchronously. */
  get current(): Settings {
    return this.cached;
  }

  async load(): Promise<Result<Settings, ConfigurationError>> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const validated = SettingsSchema.safeParse(parsed);

      if (!validated.success) {
        this.logger.warn('settings file failed validation, resetting to defaults', {
          filePath: this.filePath,
          issues: validated.error.issues.map((issue) => issue.message),
        });
        this.cached = DEFAULT_SETTINGS;
        await this.persist(this.cached);
        return ok(this.cached);
      }

      this.cached = validated.data;
      return ok(this.cached);
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        this.logger.info('no settings file found, writing defaults', { filePath: this.filePath });
        this.cached = DEFAULT_SETTINGS;
        await this.persist(this.cached);
        return ok(this.cached);
      }

      this.logger.warn('settings file is unreadable or corrupt, falling back to defaults', {
        filePath: this.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      this.cached = DEFAULT_SETTINGS;
      return ok(this.cached);
    }
  }

  async update(patch: SettingsUpdate): Promise<Result<Settings, ConfigurationError>> {
    const validatedPatch = SettingsUpdateSchema.safeParse(patch);
    if (!validatedPatch.success) {
      return err(
        new ConfigurationError({
          message: 'Invalid settings update',
          context: { issues: validatedPatch.error.issues.map((issue) => issue.message) },
        }),
      );
    }

    const next: Settings = {
      schemaVersion: this.cached.schemaVersion,
      theme: validatedPatch.data.theme ?? this.cached.theme,
      recentProjects: validatedPatch.data.recentProjects ?? this.cached.recentProjects,
      logging:
        validatedPatch.data.logging?.level !== undefined
          ? { level: validatedPatch.data.logging.level }
          : this.cached.logging,
    };

    const revalidated = SettingsSchema.safeParse(next);
    if (!revalidated.success) {
      return err(
        new ConfigurationError({
          message: 'Settings update would produce an invalid state',
          context: { issues: revalidated.error.issues.map((issue) => issue.message) },
        }),
      );
    }

    try {
      await this.persist(revalidated.data);
      this.cached = revalidated.data;
      return ok(this.cached);
    } catch (error) {
      return err(new ConfigurationError({ message: 'Failed to persist settings', cause: error }));
    }
  }

  private async persist(settings: Settings): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(settings, null, 2), 'utf8');
    await rename(tempPath, this.filePath);
  }
}
