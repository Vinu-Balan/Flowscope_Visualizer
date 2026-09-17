import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { BrowserWindow, shell } from 'electron';

/**
 * Creates the single FlowScope window with a hardened renderer
 * (docs/adr/ADR-003-electron-architecture.md,
 * docs/architecture/security-architecture.md): context isolation on, no
 * Node integration, sandboxed, and only the explicit preload bridge.
 */
export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#17191f',
    autoHideMenuBar: true,
    // Packaged Windows builds already show the .exe's own icon resource
    // (electron-builder's `win.icon`, docs/sprints/SPRINT-10.md) — this is
    // what makes the window/taskbar icon correct in dev mode too, where
    // there's no packaged .exe to inherit it from.
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.on('ready-to-show', () => {
    window.show();
  });

  // Never let the renderer navigate this window away from its own app shell.
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  // Any attempt to open a new window (e.g. target="_blank") opens in the OS
  // browser instead of a second, less-hardened Electron window.
  window.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (is.dev && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}
