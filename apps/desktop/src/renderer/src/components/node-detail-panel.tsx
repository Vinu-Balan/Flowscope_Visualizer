import type { DiscoveredApi } from '@flowscope/parser-spring/api';
import { EmptyState, ScrollArea } from '@flowscope/ui';
import { LOW_CONFIDENCE_THRESHOLD } from '@flowscope/visualization';
import { MousePointerClick } from 'lucide-react';
import { useInferBusinessFlowQuery } from '../lib/queries';
import { useAppStore } from '../store/app-store';

export interface NodeDetailPanelProps {
  readonly projectPath: string | undefined;
  readonly api: DiscoveredApi | undefined;
}

/**
 * The right-hand panel: full detail for whichever graph node is
 * currently selected — the business name/description shown on the node
 * itself is deliberately short (legible in a flowchart), the rest of a
 * node's meaning lives here (docs/sprints/SPRINT-6.md).
 */
export function NodeDetailPanel({ projectPath, api }: NodeDetailPanelProps) {
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  // Shares the TanStack Query cache entry `business-flow-panel.tsx` already
  // populated for this API — no extra network round trip.
  const flowQuery = useInferBusinessFlowQuery(projectPath, api);
  const node = flowQuery.data?.nodes.find((candidate) => candidate.id === selectedNodeId);

  if (!node) {
    return (
      <EmptyState
        icon={<MousePointerClick />}
        title="No node selected"
        description="Select a step in the business flow to inspect its details here."
      />
    );
  }

  const lowConfidence = node.confidence < LOW_CONFIDENCE_THRESHOLD;
  const confidencePercent = Math.round(node.confidence * 100);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-4 text-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {node.type.replace(/-/gu, ' ')}
          </div>
          <div className="mt-0.5 text-base font-semibold text-foreground">{node.businessName}</div>
        </div>

        <p className="text-muted-foreground">{node.businessDescription}</p>

        <div
          className={
            lowConfidence
              ? 'w-fit rounded bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400'
              : 'w-fit text-xs text-muted-foreground'
          }
        >
          {lowConfidence
            ? `Inferred · Low confidence (${String(confidencePercent)}%)`
            : `Confidence: ${String(confidencePercent)}%`}
        </div>

        <div className="border-t border-border pt-3">
          <div className="text-xs font-medium text-muted-foreground">Technical</div>
          <div className="mt-1 break-all font-mono text-xs text-foreground">
            {node.technicalName}
          </div>
        </div>

        {node.source && (
          <div className="border-t border-border pt-3">
            <div className="text-xs font-medium text-muted-foreground">Source</div>
            <div className="mt-1 break-all font-mono text-xs text-foreground">
              {node.source.className ? `${node.source.className}.` : ''}
              {node.source.method ?? ''}
            </div>
            <div className="mt-0.5 break-all text-xs text-muted-foreground">
              {node.source.file}:{node.source.lineStart}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
