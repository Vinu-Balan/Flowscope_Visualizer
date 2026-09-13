import { toast } from '@flowscope/ui';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useOpenProjectMutation } from './queries';
import { type KeyboardShortcut, useKeyboardShortcuts } from './use-keyboard-shortcuts';
import { useAppStore } from '../store/app-store';

/** Wires the shortcuts listed in MASTER_PLAN.md §67 to the app store and IPC mutations. */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate();
  const commandPaletteOpen = useAppStore((state) => state.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((state) => state.setCommandPaletteOpen);
  const settingsDialogOpen = useAppStore((state) => state.settingsDialogOpen);
  const setSettingsDialogOpen = useAppStore((state) => state.setSettingsDialogOpen);
  const setCurrentProject = useAppStore((state) => state.openProject);
  const openProject = useOpenProjectMutation();

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
          openProject
            .mutateAsync()
            .then((result) => {
              if (!result.canceled) {
                setCurrentProject(result.path);
                return navigate({ to: '/workspace' });
              }
              return undefined;
            })
            .catch(() => {
              toast({ title: 'Could not open project', variant: 'error' });
            });
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
      navigate,
      openProject,
      setCommandPaletteOpen,
      setCurrentProject,
      setSettingsDialogOpen,
      settingsDialogOpen,
    ],
  );

  useKeyboardShortcuts(shortcuts);
}
