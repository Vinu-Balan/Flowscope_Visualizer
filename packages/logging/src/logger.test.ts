import { describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger';
import type { LogEntry, LogTransport } from './types';

function collectingTransport(): { transport: LogTransport; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return { transport: { write: (entry) => entries.push(entry) }, entries };
}

describe('createLogger', () => {
  it('writes entries at or above the configured level', () => {
    const { transport, entries } = collectingTransport();
    const logger = createLogger({ scope: 'test', level: 'warn', transports: [transport] });

    logger.debug('hidden');
    logger.info('hidden');
    logger.warn('shown');
    logger.error('shown too');

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.message)).toEqual(['shown', 'shown too']);
  });

  it('defaults to info level', () => {
    const { transport, entries } = collectingTransport();
    const logger = createLogger({ scope: 'test', transports: [transport] });

    logger.debug('hidden');
    logger.info('shown');

    expect(entries).toHaveLength(1);
  });

  it('stamps entries with scope and an ISO timestamp', () => {
    const { transport, entries } = collectingTransport();
    createLogger({ scope: 'analysis', transports: [transport] }).info('started');

    expect(entries[0]?.scope).toBe('analysis');
    expect(entries[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('redacts sensitive metadata before dispatching to transports', () => {
    const { transport, entries } = collectingTransport();
    createLogger({ scope: 'auth', transports: [transport] }).info('login', { token: 'secret' });

    expect(entries[0]?.meta).toEqual({ token: '[REDACTED]' });
  });

  it('fans out to every configured transport', () => {
    const a = collectingTransport();
    const b = collectingTransport();
    createLogger({ scope: 'x', transports: [a.transport, b.transport] }).error('boom');

    expect(a.entries).toHaveLength(1);
    expect(b.entries).toHaveLength(1);
  });

  it('child() namespaces the scope and preserves level/transports', () => {
    const { transport, entries } = collectingTransport();
    const parent = createLogger({ scope: 'app', level: 'error', transports: [transport] });
    const child = parent.child('ipc');

    child.warn('hidden because parent level is error');
    child.error('shown');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.scope).toBe('app:ipc');
  });

  it('never throws even if a transport itself throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const throwingTransport: LogTransport = {
      write: () => {
        throw new Error('transport exploded');
      },
    };
    const logger = createLogger({ scope: 'x', transports: [throwingTransport] });

    expect(() => {
      logger.info('test');
    }).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      '[flowscope:logging] transport threw while writing',
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });
});

describe('createLogger with a spy transport', () => {
  it('is called exactly once per log call', () => {
    const write = vi.fn();
    const logger = createLogger({ scope: 'x', transports: [{ write }] });
    logger.info('once');
    expect(write).toHaveBeenCalledTimes(1);
  });
});
