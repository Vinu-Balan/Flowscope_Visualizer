import type { LogLevel, LogMeta, Logger, LogTransport, LogEntry } from './types';
import { redact } from './redact';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface CreateLoggerOptions {
  readonly scope: string;
  readonly level?: LogLevel;
  readonly transports: readonly LogTransport[];
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const level = options.level ?? 'info';
  const minOrder = LEVEL_ORDER[level];

  function log(entryLevel: LogLevel, message: string, meta?: LogMeta): void {
    if (LEVEL_ORDER[entryLevel] < minOrder) {
      return;
    }
    const entry: LogEntry = {
      level: entryLevel,
      scope: options.scope,
      message,
      meta: meta ? redact(meta) : undefined,
      timestamp: new Date().toISOString(),
    };
    for (const transport of options.transports) {
      try {
        transport.write(entry);
      } catch (error) {
        // A broken transport must never take the application down with it.
        console.error('[flowscope:logging] transport threw while writing', error);
      }
    }
  }

  return {
    debug(message, meta) {
      log('debug', message, meta);
    },
    info(message, meta) {
      log('info', message, meta);
    },
    warn(message, meta) {
      log('warn', message, meta);
    },
    error(message, meta) {
      log('error', message, meta);
    },
    child(scope) {
      return createLogger({
        scope: `${options.scope}:${scope}`,
        level,
        transports: options.transports,
      });
    },
  };
}
