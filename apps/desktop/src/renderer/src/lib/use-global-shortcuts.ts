import { useMemo } from 'react';
import { useAppStore } from '../store/app-store';
import { type KeyboardShortcut, useKeyboardShortcuts } from './use-keyboard-shortcuts';
import { useOpenProjectFlow } from './use-open-project';

/** Wires the shortcuts listed in MASTER_PLAN.md §67 to the app store and IPC mutations. */
export function useGlobalShortcuts(): void {
  const commandPaletteOpen = useAppStore((state) => state.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((state) => state.setCommandPaletteOpen);
  const settingsDialogOpen = useAppStore((state) => state.settingsDialogOpen);
  const setSettingsDialogOpen = useAppStore((state) => state.setSettingsDialogOpen);
  const { openViaDialog } = useOpenProjectFlow();

  const shortcuts = useMemo<KeyboardShortcut[]>(
    () => [
      {
        key: 'k',
        mod: true,
        handler: () => {
          setCommandPaletteOpen(!commandPaletteOpen);
        },
      },
      {
        key: 'p',
        mod: true,
        handler: () => {
          setCommandPaletteOpen(!commandPaletteOpen);
        },
      },
      {
        key: 'o',
        mod: true,
        handler: () => {
          void openViaDialog();
        },
      },
      {
        key: ',',
        mod: true,
        handler: () => {
          setSettingsDialogOpen(!settingsDialogOpen);
        },
      },
      {
        key: 'Escape',
        preventDefault: false,
        handler: () => {
          setCommandPaletteOpen(false);
          setSettingsDialogOpen(false);
        },
      },
    ],
    [
      commandPaletteOpen,
      openViaDialog,
      setCommandPaletteOpen,
      setSettingsDialogOpen,
      settingsDialogOpen,
    ],
  );

  useKeyboardShortcuts(shortcuts);
}
