import { Button, Kbd, ScrollArea } from '@flowscope/ui';
import { FolderOpen, GitBranch, History, Search, Sparkles, Waypoints } from 'lucide-react';
import { useOpenProjectFlow } from '../lib/use-open-project';
import { useSettingsQuery } from '../lib/queries';

const FEATURES = [
  { icon: Waypoints, label: 'See business flows, not framework wiring' },
  { icon: Search, label: 'Jump from any step straight to its source' },
  { icon: GitBranch, label: 'Runs entirely on your machine — nothing leaves it' },
] as const;

/** Best-effort display name for a stored path, without relying on Node's `path` module in the renderer. */
function basenameOf(rawPath: string): string {
  const segments = rawPath.split(/[/\\]+/).filter(Boolean);
  return segments[segments.length - 1] ?? rawPath;
}

export function WelcomeRoute() {
  const { openViaDialog, validateAndEnter, isPending } = useOpenProjectFlow();
  const settingsQuery = useSettingsQuery();
  const recentProjects = settingsQuery.data?.recentProjects ?? [];

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto">
      <div className="w-full max-w-md px-6 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-foreground">FlowScope</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Open a Spring Boot project to see what it actually does — as a business flow, not a class
          diagram.
        </p>

        <div className="mt-6 flex flex-col items-center gap-2">
          <Button onClick={() => void openViaDialog()} disabled={isPending}>
            <FolderOpen className="h-4 w-4" />
            {isPending ? 'Opening…' : 'Open Project'}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            or press <Kbd keys={['Ctrl', 'O']} />
          </span>
        </div>

        <ul className="mt-10 space-y-3 text-left">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
              {label}
            </li>
          ))}
        </ul>

        {recentProjects.length > 0 && (
          <div className="mt-10 text-left">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <History className="h-3 w-3" />
              Recent Projects
            </div>
            <ScrollArea className="max-h-40">
              <ul className="space-y-0.5 pr-2">
                {recentProjects.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => void validateAndEnter(path)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50"
                    >
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-foreground">
                          {basenameOf(path)}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {path}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
