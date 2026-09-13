import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileTransport } from './file-transport';
import type { LogEntry } from './types';

const sample: LogEntry = {
  level: 'info',
  scope: 'test',
  message: 'hello',
  timestamp: '2026-01-01T00:00:00.000Z',
};

describe('createFileTransport', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'flowscope-logging-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates parent directories and appends JSON lines', async () => {
    const filePath = join(dir, 'nested', 'flowscope.log');
    const transport = createFileTransport({ filePath });

    transport.write(sample);
    transport.write({ ...sample, message: 'second' });

    await vi.waitFor(async () => {
      const content = await readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0] ?? '')).toEqual(sample);
    });
  });
});
