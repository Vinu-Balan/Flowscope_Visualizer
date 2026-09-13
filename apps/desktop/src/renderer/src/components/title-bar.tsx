import { Button, Kbd, Tooltip, toast } from '@flowscope/ui';
import { useNavigate } from '@tanstack/react-router';
import { FolderOpen, Search, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { useOpenProjectMutation } from '../lib/queries';
import { useAppStore } from '../store/app-store';

export function TitleBar() {
  const navigate = useNavigate();
  const setCommandPaletteOpen = useAppStore((state) => state.setCommandPaletteOpen);
  const setSettingsDialogOpen = useAppStore((state) => state.setSettingsDialogOpen);
  const setCurrentProject = useAppStore((state) => state.openProject);
  const openProject = useOpenProjectMutation();

  async function handleOpenProject(): Promise<void> {
    try {
      const result = await openProject.mutateAsync();
      if (result.canceled) {
        return;
      }
      setCurrentProject(result.path);
      await navigate({ to: '/workspace' });
    } catch {
      toast({ title: 'Could not open project', variant: 'error' });
    }
  }

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-accent" />
        FlowScope
      </div>

      <div className="mx-1 h-4 w-px bg-border" />

      <Tooltip
        content={
          <span className="flex items-center gap-1.5">
            Open Project <Kbd keys={['Ctrl', 'O']} />
          </span>
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleOpenProject()}
          disabled={openProject.isPending}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {openProject.isPending ? 'Opening…' : 'Open Project'}
        </Button>
      </Tooltip>

      <Tooltip content="Project analysis lands in a later sprint">
        <span>
          <Button variant="outline" size="sm" disabled>
            <Sparkles className="h-3.5 w-3.5" />
            Analyze
          </Button>
        </span>
      </Tooltip>

      <div className="flex-1" />

      <Tooltip
        content={
          <span className="flex items-center gap-1.5">
            Search <Kbd keys={['Ctrl', 'K']} />
          </span>
        }
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setCommandPaletteOpen(true);
          }}
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </Button>
      </Tooltip>

      <Tooltip content="Settings">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setSettingsDialogOpen(true);
          }}
          aria-label="Settings"
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </Tooltip>
    </header>
  );
}
