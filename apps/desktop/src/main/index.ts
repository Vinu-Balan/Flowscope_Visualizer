import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './ipc-handlers';
import { initializeLogger } from './logger';
import { initializeSettingsStore } from './settings';
import { createMainWindow } from './window';

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [existingWindow] = BrowserWindow.getAllWindows();
    if (existingWindow) {
      if (existingWindow.isMinimized()) {
        existingWindow.restore();
      }
      existingWindow.focus();
    }
  });

  void app.whenReady().then(async () => {
    electronApp.setAppUserModelId('dev.flowscope.desktop');
    app.on('browser-window-created', (_event, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    // Bootstrap logging at a default level before settings are loaded, then
    // re-create it once the persisted logging level is known.
    const bootstrapLogger = initializeLogger('info');
    const settingsStore = initializeSettingsStore(bootstrapLogger);
    const loadResult = await settingsStore.load();
    if (!loadResult.ok) {
      bootstrapLogger.error('failed to load settings', { error: loadResult.error.toJSON() });
    }

    const logger = initializeLogger(settingsStore.current.logging.level);
    logger.info('FlowScope starting', { appVersion: app.getVersion(), dev: is.dev });

    const window = createMainWindow();
    registerIpcHandlers({ window, settings: settingsStore, logger });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const newWindow = createMainWindow();
        registerIpcHandlers({ window: newWindow, settings: settingsStore, logger });
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
