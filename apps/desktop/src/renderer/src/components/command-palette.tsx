import { Kbd } from '@flowscope/ui';
import { Command } from 'cmdk';
import {
  FolderOpen,
  Moon,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  SunMoon,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { useUpdateSettingsMutation } from '../lib/queries';
import { useAnalyzeProjectFlow } from '../lib/use-analyze-project';
import { useOpenProjectFlow } from '../lib/use-open-project';
import { useAppStore } from '../store/app-store';

interface CommandItem {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly shortcut?: readonly string[];
  run: () => void | Promise<void>;
}

export function CommandPalette() {
  const open = useAppStore((state) => state.commandPaletteOpen);
  const setOpen = useAppStore((state) => state.setCommandPaletteOpen);
  const setSettingsOpen = useAppStore((state) => state.setSettingsDialogOpen);
  const { openViaDialog } = useOpenProjectFlow();
  const { analyze, canAnalyze } = useAnalyzeProjectFlow();
  const updateSettings = useUpdateSettingsMutation();

  const items = useMemo<CommandItem[]>(
    () => [
      {
        id: 'open-project',
        label: 'Open Project…',
        icon: FolderOpen,
        shortcut: ['Ctrl', 'O'],
        run: async () => {
          setOpen(false);
          await openViaDialog();
        },
      },
      ...(canAnalyze
        ? [
            {
              id: 'analyze-project',
              label: 'Analyze Project',
              icon: Sparkles,
              shortcut: ['Ctrl', 'Shift', 'A'],
              run: async () => {
                setOpen(false);
                await analyze();
              },
            },
          ]
        : []),
      {
        id: 'open-settings',
        label: 'Open Settings',
        icon: SettingsIcon,
        shortcut: ['Ctrl', ','],
        run: () => {
          setOpen(false);
          setSettingsOpen(true);
        },
      },
      {
        id: 'theme-dark',
        label: 'Theme: Dark',
        icon: Moon,
        run: () => {
          setOpen(false);
          updateSettings.mutate({ theme: 'dark' });
        },
      },
      {
        id: 'theme-light',
        label: 'Theme: Light',
        icon: Sun,
        run: () => {
          setOpen(false);
          updateSettings.mutate({ theme: 'light' });
        },
      },
      {
        id: 'theme-system',
        label: 'Theme: Match System',
        icon: SunMoon,
        run: () => {
          setOpen(false);
          updateSettings.mutate({ theme: 'system' });
        },
      },
    ],
    [analyze, canAnalyze, openViaDialog, setOpen, setSettingsOpen, updateSettings],
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command Menu"
      className="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
    >
      <Command.Input
        placeholder="Type a command or search…"
        className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      <Command.List className="max-h-80 overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-xs text-muted-foreground">
          No matching commands.
        </Command.Empty>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Command.Item
              key={item.id}
              onSelect={() => void item.run()}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-foreground aria-selected:bg-surface-hover"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">{item.label}</span>
              {item.shortcut && <Kbd keys={item.shortcut} />}
            </Command.Item>
          );
        })}
      </Command.List>
    </Command.Dialog>
  );
}
