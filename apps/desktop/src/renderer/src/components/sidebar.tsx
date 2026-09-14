import type { HttpMethod } from '@flowscope/parser-spring/api';
import { summarizeScan } from '@flowscope/scanner/scan-result';
import {
  cn,
  EmptyState,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@flowscope/ui';
import { AlertTriangle, FileCode2, FolderTree, History, Loader2 } from 'lucide-react';
import { useDiscoverApisQuery, useProjectScanQuery } from '../lib/queries';
import { useAppStore, type SidebarTab } from '../store/app-store';

const HTTP_METHOD_CLASS: Record<HttpMethod, string> = {
  GET: 'text-emerald-600 dark:text-emerald-400',
  POST: 'text-blue-600 dark:text-blue-400',
  PUT: 'text-amber-600 dark:text-amber-400',
  PATCH: 'text-amber-600 dark:text-amber-400',
  DELETE: 'text-red-600 dark:text-red-400',
};

function ArchitectureTabContent() {
  const currentProject = useAppStore((state) => state.currentProject);
  const selectedApiId = useAppStore((state) => state.selectedApiId);
  const setSelectedApiId = useAppStore((state) => state.setSelectedApiId);
  const scanQuery = useProjectScanQuery(currentProject?.path);
  const discoverApisQuery = useDiscoverApisQuery(currentProject?.path);

  if (scanQuery.isFetching || discoverApisQuery.isFetching) {
    return (
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {scanQuery.isFetching ? 'Scanning project…' : 'Discovering APIs…'}
      </div>
    );
  }

  const summary = scanQuery.data ? summarizeScan(scanQuery.data) : null;
  const apis = discoverApisQuery.data?.apis ?? [];

  return (
    <>
      {(scanQuery.isError || discoverApisQuery.isError) && (
        <div className="flex items-start gap-2 border-b border-border px-3 py-2.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {scanQuery.isError
              ? `Scan failed: ${scanQuery.error.message}`
              : `API discovery failed: ${discoverApisQuery.error?.message ?? 'unknown error'}`}
          </span>
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

      {apis.length > 0 ? (
        <ul className="py-1">
          {apis.map((api) => (
            <li key={api.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedApiId(api.id === selectedApiId ? null : api.id);
                }}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/10',
                  selectedApiId === api.id && 'bg-accent/15',
                )}
              >
                <span
                  className={cn(
                    'w-14 shrink-0 font-mono font-semibold',
                    HTTP_METHOD_CLASS[api.httpMethod],
                  )}
                >
                  {api.httpMethod}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-foreground">{api.path}</span>
                  <span className="block truncate text-muted-foreground">
                    {api.className}.{api.methodName}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<FolderTree />}
          title="No APIs discovered yet"
          description={
            summary
              ? 'No Spring REST controllers were found in this project.'
              : 'Open a project and click Analyze to scan its source files.'
          }
          className="p-6"
        />
      )}
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
