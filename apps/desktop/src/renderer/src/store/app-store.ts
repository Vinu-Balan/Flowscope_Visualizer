import type { ValidatedProject } from '@flowscope/workspace/project';
import { create } from 'zustand';

export type SidebarTab = 'architecture' | 'trace-logs';

interface AppState {
  readonly sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;

  readonly commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  readonly settingsDialogOpen: boolean;
  setSettingsDialogOpen: (open: boolean) => void;

  /** The last project that passed `project.validate` (docs/sprints/SPRINT-2.md). */
  readonly currentProject: ValidatedProject | null;
  setCurrentProject: (project: ValidatedProject) => void;
  closeProject: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarTab: 'architecture',
  setSidebarTab: (tab) => {
    set({ sidebarTab: tab });
  },

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => {
    set({ commandPaletteOpen: open });
  },

  settingsDialogOpen: false,
  setSettingsDialogOpen: (open) => {
    set({ settingsDialogOpen: open });
  },

  currentProject: null,
  setCurrentProject: (project) => {
    set({ currentProject: project });
  },
  closeProject: () => {
    set({ currentProject: null });
  },
}));
