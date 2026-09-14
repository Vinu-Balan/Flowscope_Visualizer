import { summarizeScan } from '@flowscope/scanner/scan-result';
import { EmptyState, ScrollArea, Tabs, TabsContent, TabsList, TabsTrigger } from '@flowscope/ui';
import { AlertTriangle, FileCode2, FolderTree, History, Loader2 } from 'lucide-react';
import { useProjectScanQuery } from '../lib/queries';
import { useAppStore, type SidebarTab } from '../store/app-store';

function ArchitectureTabContent() {
  const currentProject = useAppStore((state) => state.currentProject);
  const scanQuery = useProjectScanQuery(currentProject?.path);

  if (scanQuery.isFetching) {
    return (
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Scanning project…
      </div>
    );
  }

  const summary = scanQuery.data ? summarizeScan(scanQuery.data) : null;

  return (
    <>
      {scanQuery.isError && (
        <div className="flex items-start gap-2 border-b border-border px-3 py-2.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Scan failed: {scanQuery.error.message}</span>
        </div>
      )}

      {summary && (
        <div className="border-b border-border px-3 py-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <FileCode2 className="h-3.5 w-3.5 text-accent" />
            {summary.totalJavaFiles} Java {summary.totalJavaFiles === 1 ? 'file' : 'files'}
          </div>
          <div className="mt-0.5 text-muted-foreground">
            {summary.mainJavaFiles} main · {summary.testJavaFiles} test
            {summary.otherJavaFiles > 0 ? ` · ${String(summary.otherJavaFiles)} other` : ''} ·{' '}
            {summary.totalResourceFiles}{' '}
            {summary.totalResourceFiles === 1 ? 'resource' : 'resources'}
          </div>
        </div>
      )}

      <EmptyState
        icon={<FolderTree />}
        title="No APIs discovered yet"
        description={
          summary
            ? 'Java files were found, but parsing them for APIs lands in a later sprint.'
            : 'Open a project and click Analyze to scan its source files.'
        }
        className="p-6"
      />
    </>
  );
}

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
            <ArchitectureTabContent />
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
