import type { LogEntry, LogTransport } from './types';

export interface ConsoleTransportOptions {
  /** 'pretty' for human-readable dev output, 'json' for machine-parseable production output. */
  readonly format?: 'pretty' | 'json';
}

const CONSOLE_METHOD = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
} as const satisfies Record<LogEntry['level'], keyof Console>;

export function createConsoleTransport(options: ConsoleTransportOptions = {}): LogTransport {
  const format = options.format ?? 'pretty';

  return {
    write(entry) {
      const method = CONSOLE_METHOD[entry.level];
      // eslint-disable-next-line no-console -- this function IS the console transport
      const log = console[method].bind(console);

      if (format === 'json') {
        log(JSON.stringify(entry));
        return;
      }

      const prefix = `${entry.timestamp} ${entry.level.toUpperCase().padEnd(5)} [${entry.scope}]`;
      if (entry.meta && Object.keys(entry.meta).length > 0) {
        log(prefix, entry.message, entry.meta);
      } else {
        log(prefix, entry.message);
      }
    },
  };
}
