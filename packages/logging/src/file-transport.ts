import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LogEntry, LogTransport } from './types';

export interface FileTransportOptions {
  /** Absolute path to a JSON-lines log file. Parent directories are created on first write. */
  readonly filePath: string;
}

/**
 * Node-only transport (appendFile/mkdir) — use only in the Electron main
 * process, never in the renderer. Never throws: a logging failure must not
 * crash the application, so write errors are reported to stderr instead.
 */
export function createFileTransport(options: FileTransportOptions): LogTransport {
  const { filePath } = options;

  // Every write is chained onto this promise so concurrent write() calls
  // still append in call order instead of racing each other on disk.
  let queue: Promise<void> = mkdir(dirname(filePath), { recursive: true }).then(() => undefined);

  return {
    write(entry: LogEntry) {
      queue = queue
        .then(() => appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8'))
        .catch((error: unknown) => {
          console.error('[flowscope:logging] failed to write log file', error);
        });
    },
  };
}
