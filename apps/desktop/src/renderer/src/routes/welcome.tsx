import { Button, Kbd, toast } from '@flowscope/ui';
import { useNavigate } from '@tanstack/react-router';
import { FolderOpen, GitBranch, Search, Sparkles, Waypoints } from 'lucide-react';
import { useOpenProjectMutation } from '../lib/queries';
import { useAppStore } from '../store/app-store';

const FEATURES = [
  { icon: Waypoints, label: 'See business flows, not framework wiring' },
  { icon: Search, label: 'Jump from any step straight to its source' },
  { icon: GitBranch, label: 'Runs entirely on your machine — nothing leaves it' },
] as const;

export function WelcomeRoute() {
  const navigate = useNavigate();
  const openProject = useOpenProjectMutation();
  const setCurrentProject = useAppStore((state) => state.openProject);

  async function handleOpenProject(): Promise<void> {
    try {
      const result = await openProject.mutateAsync();
      if (result.canceled) {
        return;
      }
      setCurrentProject(result.path);
      await navigate({ to: '/workspace' });
    } catch {
      toast({
        title: 'Could not open project',
        description: 'Check the application logs for details.',
        variant: 'error',
      });
    }
  }

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
          <Button onClick={() => void handleOpenProject()} disabled={openProject.isPending}>
            <FolderOpen className="h-4 w-4" />
            {openProject.isPending ? 'Opening…' : 'Open Project'}
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
      </div>
    </div>
  );
}
