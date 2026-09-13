import { StatusBarItem } from '@flowscope/ui';
import { CircleDot, FolderGit2, PlugZap } from 'lucide-react';
import { usePingQuery } from '../lib/queries';
import { useAppStore } from '../store/app-store';

export function StatusBar() {
  const currentProjectPath = useAppStore((state) => state.currentProjectPath);
  const ping = usePingQuery();

  const engineLabel = ping.isSuccess
    ? 'Engine connected'
    : ping.isError
      ? 'Engine unreachable'
      : 'Connecting…';

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-surface">
      <div className="flex items-center">
        <StatusBarItem icon={<PlugZap />} label={engineLabel} />
        {currentProjectPath && <StatusBarItem icon={<FolderGit2 />} label={currentProjectPath} />}
      </div>
      <div className="flex items-center">
        <StatusBarItem icon={<CircleDot />} label="Ready" />
      </div>
    </footer>
  );
}
