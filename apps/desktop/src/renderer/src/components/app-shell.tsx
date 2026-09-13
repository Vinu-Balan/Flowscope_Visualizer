import { Toaster, TooltipProvider } from '@flowscope/ui';
import { Outlet } from '@tanstack/react-router';
import { useGlobalShortcuts } from '../lib/use-global-shortcuts';
import { useThemeSync } from '../lib/use-theme-sync';
import { CommandPalette } from './command-palette';
import { SettingsDialog } from './settings-dialog';
import { StatusBar } from './status-bar';
import { TitleBar } from './title-bar';

/** The persistent frame every route renders inside: toolbar, outlet, status bar, overlays. */
export function AppShell() {
  useThemeSync();
  useGlobalShortcuts();

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <TitleBar />
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
        <StatusBar />
      </div>
      <CommandPalette />
      <SettingsDialog />
      <Toaster />
    </TooltipProvider>
  );
}
