import { EmptyState } from '@flowscope/ui';
import { MousePointerClick, Waypoints } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useAppStore } from '../store/app-store';
import { Sidebar } from './sidebar';

const RESIZE_HANDLE_CLASS =
  'w-px bg-border transition-colors hover:bg-accent data-[resize-handle-active]:bg-accent';

const BUILD_SYSTEM_LABEL = { maven: 'Maven', gradle: 'Gradle' } as const;

export function WorkspaceShell() {
  const currentProject = useAppStore((state) => state.currentProject);

  return (
    <PanelGroup direction="horizontal" className="min-h-0 flex-1">
      <Panel defaultSize={22} minSize={16} maxSize={36} className="min-w-0">
        <Sidebar />
      </Panel>

      <PanelResizeHandle className={RESIZE_HANDLE_CLASS} />

      <Panel defaultSize={56} minSize={30} className="min-w-0">
        <EmptyState
          icon={<Waypoints />}
          title="No business flow to show yet"
          description={
            currentProject
              ? `${currentProject.name} (${BUILD_SYSTEM_LABEL[currentProject.buildSystem]}) is open. Run analysis once it's available to discover its APIs and see their business flows here.`
              : 'Select an API from the sidebar once analysis is available to see its business flow here.'
          }
        />
      </Panel>

      <PanelResizeHandle className={RESIZE_HANDLE_CLASS} />

      <Panel defaultSize={22} minSize={16} maxSize={36} className="min-w-0">
        <EmptyState
          icon={<MousePointerClick />}
          title="No node selected"
          description="Select a step in the business flow to inspect its details here."
        />
      </Panel>
    </PanelGroup>
  );
}
