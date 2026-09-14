import type { BegEdgeType, BegGraph, BegNode, BegNodeType } from '@flowscope/graph-schema';
import type { DiscoveredApi } from '@flowscope/parser-spring/api';
import { EmptyState, ScrollArea } from '@flowscope/ui';
import {
  AlertTriangle,
  Cloud,
  Database,
  GitBranch,
  Inbox,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Reply,
  Send,
  ShieldCheck,
  Wand2,
  Waypoints,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useInferBusinessFlowQuery } from '../lib/queries';

const NODE_ICON: Record<BegNodeType, LucideIcon> = {
  'business-step': Workflow,
  decision: GitBranch,
  validation: ShieldCheck,
  'database-operation': Database,
  'external-service': Cloud,
  'message-publish': Send,
  'message-consume': Inbox,
  transformation: Wand2,
  authentication: KeyRound,
  authorization: Lock,
  transaction: Layers,
  response: Reply,
  error: AlertTriangle,
  'system-boundary': Layers,
};

/** Low-confidence inferences are always flagged, never presented as fact (MASTER_PLAN.md §12). */
const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** Describes the edge leading into a step, when it isn't a plain 'sequence' continuation — since Sprint 5 flattens branching into one list (docs/sprints/SPRINT-5.md), these labels are what keep that honest. */
const EDGE_LABEL: Partial<Record<BegEdgeType, string>> = {
  error: 'if the check above failed',
  conditional: 'otherwise',
};

function StepRow({
  node,
  incomingEdgeType,
}: {
  readonly node: BegNode;
  readonly incomingEdgeType: BegEdgeType | undefined;
}) {
  const Icon = NODE_ICON[node.type];
  const edgeLabel = incomingEdgeType ? EDGE_LABEL[incomingEdgeType] : undefined;
  const lowConfidence = node.confidence < LOW_CONFIDENCE_THRESHOLD;

  return (
    <li>
      {edgeLabel && (
        <div className="py-1 pl-4 text-[11px] italic text-muted-foreground">{edgeLabel}</div>
      )}
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface p-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-foreground">{node.businessName}</span>
            {lowConfidence && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                Inferred · Low confidence
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{node.businessDescription}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground/70">
            {node.technicalName}
          </div>
        </div>
      </div>
    </li>
  );
}

function StepList({ graph }: { readonly graph: BegGraph }) {
  const incomingEdgeTypeByNodeId = new Map(graph.edges.map((edge) => [edge.to, edge.type]));

  return (
    <ol className="space-y-0.5 p-4">
      {graph.nodes.map((node, index) => (
        <StepRow
          key={node.id}
          node={node}
          incomingEdgeType={index === 0 ? undefined : incomingEdgeTypeByNodeId.get(node.id)}
        />
      ))}
    </ol>
  );
}

export interface BusinessFlowPanelProps {
  readonly projectPath: string | undefined;
  readonly api: DiscoveredApi | undefined;
  readonly emptyDescription: string;
}

/**
 * The center canvas's business flow view — a simple ordered step list for
 * now. Interactive graph rendering (Cytoscape/ELK, pan/zoom, node click →
 * Inspector) is Sprint 6's work; this renders the same underlying BEG,
 * just not as a canvas yet (docs/sprints/SPRINT-5.md).
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
    <ScrollArea className="h-full">
      <div className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">
        {api.httpMethod} {api.path}
      </div>
      <StepList graph={flowQuery.data} />
    </ScrollArea>
  );
}
