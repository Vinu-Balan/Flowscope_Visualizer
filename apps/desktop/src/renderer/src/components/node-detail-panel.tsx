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
/** One labeled row in the Technical section — only rendered when its value is known, never a fabricated placeholder. */
function TechnicalRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex gap-2">
      <div className="w-16 shrink-0 text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 break-all font-mono text-foreground">{value}</div>
    </div>
  );
}

const EDGE_TYPE_ARROW: Readonly<Record<string, string>> = {
  success: '✓',
  error: '✕',
  conditional: '?',
  loop: '↻',
};

export function NodeDetailPanel({ projectPath, api }: NodeDetailPanelProps) {
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  // Shares the TanStack Query cache entry `business-flow-panel.tsx` already
  // populated for this API — no extra network round trip.
  const flowQuery = useInferBusinessFlowQuery(projectPath, api);
  const graph = flowQuery.data;
  const node = graph?.nodes.find((candidate) => candidate.id === selectedNodeId);

  if (!node || !graph) {
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

  // A step's meaning is as much about what leads into it and what it
  // leads to as the step itself — especially for a decision, where "what
  // happens if this passes or fails" is exactly what a developer reading
  // this panel instead of the source needs (the original ask behind
  // docs/sprints/SPRINT-6.md, extended per-node in SPRINT-7.md). Resolved
  // from the same graph the canvas renders, so it never drifts from what's
  // drawn.
  const incoming = graph.edges
    .filter((edge) => edge.to === node.id)
    .map((edge) => ({ edge, from: graph.nodes.find((candidate) => candidate.id === edge.from) }));
  const outgoing = graph.edges
    .filter((edge) => edge.from === node.id)
    .map((edge) => ({ edge, to: graph.nodes.find((candidate) => candidate.id === edge.to) }));

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

        {(incoming.length > 0 || outgoing.length > 0) && (
          <div className="border-t border-border pt-3">
            <div className="text-xs font-medium text-muted-foreground">Flow</div>
            <div className="mt-1.5 flex flex-col gap-1 text-xs">
              {incoming.map(({ edge, from }) => (
                <div key={edge.id} className="flex items-baseline gap-1.5 text-muted-foreground">
                  <span className="w-3 shrink-0 text-center">←</span>
                  <span>
                    {from?.businessName ?? 'Start'}
                    {edge.label ? ` (${edge.label})` : ''}
                  </span>
                </div>
              ))}
              {outgoing.map(({ edge, to }) => (
                <div key={edge.id} className="flex items-baseline gap-1.5">
                  <span className="w-3 shrink-0 text-center text-muted-foreground">
                    {EDGE_TYPE_ARROW[edge.type] ?? '→'}
                  </span>
                  <span className="text-foreground">
                    {edge.label ? <span className="font-medium">{edge.label}: </span> : null}
                    {to?.businessName ?? 'End'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-border pt-3">
          <div className="text-xs font-medium text-muted-foreground">Technical</div>
          <div className="mt-1.5 flex flex-col gap-1 text-xs">
            <TechnicalRow label="Call" value={node.technicalName} />
            {node.source?.className && <TechnicalRow label="Class" value={node.source.className} />}
            {node.source?.method && <TechnicalRow label="Method" value={node.source.method} />}
            {node.source && (
              <TechnicalRow
                label="Location"
                value={`${node.source.file}:${String(node.source.lineStart)}`}
              />
            )}
            <TechnicalRow label="Node type" value={node.type} />
            <TechnicalRow label="Node ID" value={node.id} />
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
