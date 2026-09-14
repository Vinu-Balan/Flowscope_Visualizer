import type { BegGraph } from '@flowscope/graph-schema';
import type { DiscoveredApi } from '@flowscope/parser-spring/api';
import { EmptyState } from '@flowscope/ui';
import { createGraphView } from '@flowscope/visualization';
import { AlertTriangle, Loader2, Waypoints } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useInferBusinessFlowQuery } from '../lib/queries';
import { useResolvedTheme } from '../lib/use-resolved-theme';
import { useAppStore } from '../store/app-store';

function GraphCanvas({ graph }: { readonly graph: BegGraph }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const setSelectedNodeId = useAppStore((state) => state.setSelectedNodeId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const cy = createGraphView(container, graph, { theme, onSelectNode: setSelectedNodeId });
    return () => {
      cy.destroy();
    };
  }, [graph, theme, setSelectedNodeId]);

  return <div ref={containerRef} className="h-full w-full" />;
}

export interface BusinessFlowPanelProps {
  readonly projectPath: string | undefined;
  readonly api: DiscoveredApi | undefined;
  readonly emptyDescription: string;
}

/**
 * The center canvas's business flow view — a real, interactive flowchart
 * (Cytoscape.js + ELK.js, MASTER_PLAN.md §9): decision nodes branch into
 * their two outcomes with Yes/No edge labels, laid out top-to-bottom, pan
 * and zoom. Clicking a node selects it; full detail beyond the node's
 * short on-canvas label lives in `node-detail-panel.tsx`
 * (docs/sprints/SPRINT-6.md).
 */
export function BusinessFlowPanel({ projectPath, api, emptyDescription }: BusinessFlowPanelProps) {
  const flowQuery = useInferBusinessFlowQuery(projectPath, api);

  if (!api) {
    return (
      <EmptyState
        icon={<Waypoints />}
        title="No business flow to show yet"
        description={emptyDescription}
      />
    );
  }

  if (flowQuery.isFetching) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Inferring business flow…
      </div>
    );
  }

  if (flowQuery.isError) {
    return (
      <div className="flex items-start gap-2 p-4 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Could not infer a business flow: {flowQuery.error.message}</span>
      </div>
    );
  }

  if (!flowQuery.data || flowQuery.data.nodes.length === 0) {
    return (
      <EmptyState
        icon={<Waypoints />}
        title="No business flow inferred"
        description={`${api.httpMethod} ${api.path} didn't produce any recognizable steps.`}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">
        {api.httpMethod} {api.path}
      </div>
      <div className="min-h-0 flex-1">
        <GraphCanvas graph={flowQuery.data} />
      </div>
    </div>
  );
}
