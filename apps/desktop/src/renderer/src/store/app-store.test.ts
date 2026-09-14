import type { ValidatedProject } from '@flowscope/workspace/project';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './app-store';

const sampleProject: ValidatedProject = {
  id: '/tmp/my-project',
  path: '/tmp/my-project',
  name: 'my-project',
  buildSystem: 'maven',
  buildFile: 'pom.xml',
  looksLikeSpringBoot: true,
};

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      sidebarTab: 'architecture',
      commandPaletteOpen: false,
      settingsDialogOpen: false,
      currentProject: null,
    });
  });

  it('defaults to the architecture tab with every overlay closed', () => {
    const state = useAppStore.getState();
    expect(state.sidebarTab).toBe('architecture');
    expect(state.commandPaletteOpen).toBe(false);
    expect(state.settingsDialogOpen).toBe(false);
    expect(state.currentProject).toBeNull();
  });

  it('setSidebarTab switches tabs', () => {
    useAppStore.getState().setSidebarTab('trace-logs');
    expect(useAppStore.getState().sidebarTab).toBe('trace-logs');
  });

  it('setCurrentProject / closeProject track the validated project', () => {
    useAppStore.getState().setCurrentProject(sampleProject);
    expect(useAppStore.getState().currentProject).toEqual(sampleProject);

    useAppStore.getState().closeProject();
    expect(useAppStore.getState().currentProject).toBeNull();
  });

  it('command palette and settings dialog toggle independently', () => {
    useAppStore.getState().setCommandPaletteOpen(true);
    expect(useAppStore.getState().commandPaletteOpen).toBe(true);
    expect(useAppStore.getState().settingsDialogOpen).toBe(false);

    useAppStore.getState().setSettingsDialogOpen(true);
    expect(useAppStore.getState().settingsDialogOpen).toBe(true);
  });
});
