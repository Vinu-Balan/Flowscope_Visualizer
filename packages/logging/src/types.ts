export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMeta {
  readonly [key: string]: unknown;
}

export interface LogEntry {
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly meta?: LogMeta | undefined;
  readonly timestamp: string;
}

export interface LogTransport {
  write(entry: LogEntry): void;
}

export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  /** Returns a child logger whose scope is `<parent>:<scope>`, sharing transports and level. */
  child(scope: string): Logger;
}
