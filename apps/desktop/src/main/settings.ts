import { join } from 'node:path';
import { SettingsStore } from '@flowscope/config';
import type { Logger } from '@flowscope/logging';
import { app } from 'electron';

let store: SettingsStore | undefined;

export function initializeSettingsStore(logger: Logger): SettingsStore {
  store = new SettingsStore(
    join(app.getPath('userData'), 'settings.json'),
    logger.child('settings'),
  );
  return store;
}

export function getSettingsStore(): SettingsStore {
  if (!store) {
    throw new Error('getSettingsStore() called before initializeSettingsStore()');
  }
  return store;
}
