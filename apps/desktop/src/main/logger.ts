import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import {
  createConsoleTransport,
  createFileTransport,
  createLogger,
  type LogLevel,
  type Logger,
} from '@flowscope/logging';
import { app } from 'electron';

let rootLogger: Logger | undefined;

/**
 * (Re-)creates the process-wide logger at the given level. Called once at
 * startup with a bootstrap level, then again once settings have loaded so
 * the persisted logging level takes effect (docs/CODING_GUIDELINES.md).
 */
export function initializeLogger(level: LogLevel): Logger {
  rootLogger = createLogger({
    scope: 'main',
    level,
    transports: [
      createConsoleTransport({ format: is.dev ? 'pretty' : 'json' }),
      createFileTransport({ filePath: join(app.getPath('userData'), 'logs', 'flowscope.log') }),
    ],
  });
  return rootLogger;
}

export function getLogger(): Logger {
  if (!rootLogger) {
    throw new Error('getLogger() called before initializeLogger()');
  }
  return rootLogger;
}
