import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConsoleTransport } from './console-transport';
import type { LogEntry } from './types';

const sample: LogEntry = {
  level: 'warn',
  scope: 'test',
  message: 'careful',
  timestamp: '2026-01-01T00:00:00.000Z',
  meta: { count: 3 },
};

describe('createConsoleTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pretty format logs a readable prefix, message, and meta via console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createConsoleTransport({ format: 'pretty' }).write(sample);

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('WARN  [test]'), 'careful', {
      count: 3,
    });
  });

  it('json format logs a single JSON-serialized argument', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createConsoleTransport({ format: 'json' }).write(sample);

    expect(spy).toHaveBeenCalledWith(JSON.stringify(sample));
  });

  it('routes each level to its matching console method', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createConsoleTransport().write({ ...sample, level: 'error', meta: undefined });
    expect(spy).toHaveBeenCalled();
  });
});
