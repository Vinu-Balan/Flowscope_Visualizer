import type { ThemePreference } from '@flowscope/config';
import { Dialog, DialogContent, DialogDescription, DialogTitle, cn } from '@flowscope/ui';
import { Moon, Sun, SunMoon, type LucideIcon } from 'lucide-react';
import { useSettingsQuery, useUpdateSettingsMutation } from '../lib/queries';
import { useAppStore } from '../store/app-store';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: SunMoon },
];

export function SettingsDialog() {
  const open = useAppStore((state) => state.settingsDialogOpen);
  const setOpen = useAppStore((state) => state.setSettingsDialogOpen);
  const settingsQuery = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>Adjust how FlowScope looks and behaves.</DialogDescription>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Theme</p>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = settingsQuery.data?.theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    updateSettings.mutate({ theme: option.value });
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 text-xs transition-colors',
                    active
                      ? 'border-accent bg-accent/10 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-surface-hover',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
