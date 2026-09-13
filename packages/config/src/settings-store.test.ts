import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConsoleTransport, createLogger } from '@flowscope/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { SettingsStore } from './settings-store';

const silentLogger = createLogger({
  scope: 'test',
  level: 'error',
  transports: [createConsoleTransport()],
});

describe('SettingsStore', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'flowscope-config-'));
    filePath = join(dir, 'settings.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes and returns defaults when no file exists yet', async () => {
    const store = new SettingsStore(filePath, silentLogger);
    const result = await store.load();

    expect(result).toEqual({ ok: true, value: DEFAULT_SETTINGS });
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual(DEFAULT_SETTINGS);
  });

  it('loads previously persisted settings', async () => {
    await writeFile(filePath, JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'light' }), 'utf8');
    const store = new SettingsStore(filePath, silentLogger);
    const result = await store.load();

    expect(result.ok && result.value.theme).toBe('light');
  });

  it('falls back to defaults and repairs a corrupt (invalid JSON) file', async () => {
    await writeFile(filePath, '{ not valid json', 'utf8');
    const store = new SettingsStore(filePath, silentLogger);
    const result = await store.load();

    expect(result).toEqual({ ok: true, value: DEFAULT_SETTINGS });
  });

  it('falls back to defaults when the file fails schema validation', async () => {
    await writeFile(filePath, JSON.stringify({ theme: 'not-a-real-theme' }), 'utf8');
    const store = new SettingsStore(filePath, silentLogger);
    const result = await store.load();

    expect(result).toEqual({ ok: true, value: DEFAULT_SETTINGS });
  });

  it('update() merges a patch, persists it, and updates .current', async () => {
    const store = new SettingsStore(filePath, silentLogger);
    await store.load();

    const result = await store.update({ theme: 'dark', recentProjects: ['/a'] });

    expect(result.ok).toBe(true);
    expect(store.current.theme).toBe('dark');
    expect(store.current.recentProjects).toEqual(['/a']);
    expect(store.current.logging.level).toBe('info');

    const onDisk: unknown = JSON.parse(await readFile(filePath, 'utf8'));
    expect(onDisk).toEqual(store.current);
  });

  it('update() rejects an invalid patch without touching the persisted file', async () => {
    const store = new SettingsStore(filePath, silentLogger);
    await store.load();

    const result = await store.update({ theme: 'not-a-real-theme' as never });

    expect(result.ok).toBe(false);
    expect(store.current).toEqual(DEFAULT_SETTINGS);
  });

  it('update() performs a partial merge of nested logging settings', async () => {
    const store = new SettingsStore(filePath, silentLogger);
    await store.load();
    await store.update({ theme: 'dark' });

    const result = await store.update({ logging: { level: 'debug' } });

    expect(result.ok && result.value.theme).toBe('dark');
    expect(result.ok && result.value.logging.level).toBe('debug');
  });
});
