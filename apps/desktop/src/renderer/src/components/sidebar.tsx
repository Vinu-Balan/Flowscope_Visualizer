import { EmptyState, ScrollArea, Tabs, TabsContent, TabsList, TabsTrigger } from '@flowscope/ui';
import { FolderTree, History } from 'lucide-react';
import { useAppStore, type SidebarTab } from '../store/app-store';

export function Sidebar() {
  const sidebarTab = useAppStore((state) => state.sidebarTab);
  const setSidebarTab = useAppStore((state) => state.setSidebarTab);

  return (
    <div className="flex h-full flex-col bg-surface">
      <Tabs
        value={sidebarTab}
        onValueChange={(value) => {
          setSidebarTab(value as SidebarTab);
        }}
        className="flex h-full flex-col"
      >
        <TabsList className="shrink-0 px-2 pt-1">
          <TabsTrigger value="architecture">Architecture</TabsTrigger>
          <TabsTrigger value="trace-logs">Trace Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="architecture" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <EmptyState
              icon={<FolderTree />}
              title="No APIs discovered yet"
              description="Open a project and run analysis to see its endpoints here."
              className="p-6"
            />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="trace-logs" className="min-h-0 flex-1">
          <EmptyState
            icon={<History />}
            title="Runtime tracing isn't available yet"
            description="Trace Logs will show live request execution once the runtime debugger ships in a later phase."
            className="p-6"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
