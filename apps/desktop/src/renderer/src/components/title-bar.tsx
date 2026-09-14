import { Button, Kbd, Tooltip } from '@flowscope/ui';
import { Link } from '@tanstack/react-router';
import { FolderOpen, Search, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { useOpenProjectFlow } from '../lib/use-open-project';
import { useAppStore } from '../store/app-store';

export function TitleBar() {
  const setCommandPaletteOpen = useAppStore((state) => state.setCommandPaletteOpen);
  const setSettingsDialogOpen = useAppStore((state) => state.setSettingsDialogOpen);
  const currentProject = useAppStore((state) => state.currentProject);
  const { openViaDialog, isPending } = useOpenProjectFlow();

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <Tooltip content="Back to Welcome">
        <Link
          to="/"
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] font-semibold text-foreground transition-colors hover:bg-surface-hover"
        >
          <Sparkles className="h-4 w-4 text-accent" />
          FlowScope
        </Link>
      </Tooltip>

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
          onClick={() => void openViaDialog()}
          disabled={isPending}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {isPending ? 'Opening…' : 'Open Project'}
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

      <div
        className="min-w-0 flex-1 truncate px-2 text-center text-[12px] text-muted-foreground"
        title={currentProject?.path}
      >
        {currentProject?.name}
      </div>

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
