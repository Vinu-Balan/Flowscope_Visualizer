import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './app-store';

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      sidebarTab: 'architecture',
      commandPaletteOpen: false,
      settingsDialogOpen: false,
      currentProjectPath: null,
    });
  });

  it('defaults to the architecture tab with every overlay closed', () => {
    const state = useAppStore.getState();
    expect(state.sidebarTab).toBe('architecture');
    expect(state.commandPaletteOpen).toBe(false);
    expect(state.settingsDialogOpen).toBe(false);
    expect(state.currentProjectPath).toBeNull();
  });

  it('setSidebarTab switches tabs', () => {
    useAppStore.getState().setSidebarTab('trace-logs');
    expect(useAppStore.getState().sidebarTab).toBe('trace-logs');
  });

  it('openProject / closeProject track the current project path', () => {
    useAppStore.getState().openProject('/tmp/my-project');
    expect(useAppStore.getState().currentProjectPath).toBe('/tmp/my-project');

    useAppStore.getState().closeProject();
    expect(useAppStore.getState().currentProjectPath).toBeNull();
  });

  it('command palette and settings dialog toggle independently', () => {
    useAppStore.getState().setCommandPaletteOpen(true);
    expect(useAppStore.getState().commandPaletteOpen).toBe(true);
    expect(useAppStore.getState().settingsDialogOpen).toBe(false);

    useAppStore.getState().setSettingsDialogOpen(true);
    expect(useAppStore.getState().settingsDialogOpen).toBe(true);
  });
});
