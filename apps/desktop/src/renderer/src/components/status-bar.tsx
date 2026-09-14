import { StatusBarItem } from '@flowscope/ui';
import { CircleDot, FolderGit2, PlugZap } from 'lucide-react';
import { usePingQuery } from '../lib/queries';
import { useAppStore } from '../store/app-store';

const BUILD_SYSTEM_LABEL = { maven: 'Maven', gradle: 'Gradle' } as const;

export function StatusBar() {
  const currentProject = useAppStore((state) => state.currentProject);
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
        {currentProject && (
          <StatusBarItem
            icon={<FolderGit2 />}
            label={`${currentProject.name} · ${BUILD_SYSTEM_LABEL[currentProject.buildSystem]}`}
          />
        )}
      </div>
      <div className="flex items-center">
        <StatusBarItem icon={<CircleDot />} label="Ready" />
      </div>
    </footer>
  );
}
