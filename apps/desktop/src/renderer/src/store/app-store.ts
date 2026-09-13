import { create } from 'zustand';

export type SidebarTab = 'architecture' | 'trace-logs';

interface AppState {
  readonly sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;

  readonly commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  readonly settingsDialogOpen: boolean;
  setSettingsDialogOpen: (open: boolean) => void;

  /** The folder the user last opened via project.open — Sprint 1 does not
   *  validate or analyze it yet (docs/sprints/SPRINT-1.md). */
  readonly currentProjectPath: string | null;
  openProject: (path: string) => void;
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

  currentProjectPath: null,
  openProject: (path) => {
    set({ currentProjectPath: path });
  },
  closeProject: () => {
    set({ currentProjectPath: null });
  },
}));
