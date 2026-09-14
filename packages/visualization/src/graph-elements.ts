import type { BegEdgeType, BegGraph, BegNodeType } from '@flowscope/graph-schema';
import type { ElementDefinition } from 'cytoscape';

/** Low-confidence inferences get a visibly distinct (dashed) border, never silently presented as fact (MASTER_PLAN.md §12). */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Flowchart shape vocabulary: a decision is a diamond (the universal
 * flowchart convention), everything else is a rounded rectangle — see
 * "Visual language" in docs/sprints/SPRINT-6.md.
 */
export const NODE_SHAPE: Record<BegNodeType, string> = {
  decision: 'diamond',
  'business-step': 'round-rectangle',
  validation: 'round-rectangle',
  'database-operation': 'round-rectangle',
  'external-service': 'round-rectangle',
  'message-publish': 'round-rectangle',
  'message-consume': 'round-rectangle',
  transformation: 'round-rectangle',
  authentication: 'round-rectangle',
  authorization: 'round-rectangle',
  transaction: 'round-rectangle',
  response: 'round-rectangle',
  error: 'round-rectangle',
  'system-boundary': 'round-rectangle',
};

/** One accent color per node type, reused for both the node border and its icon glyph in the label. */
export const NODE_COLOR: Record<BegNodeType, string> = {
  'business-step': '#2563eb',
  decision: '#d97706',
  validation: '#0891b2',
  'database-operation': '#7c3aed',
  'external-service': '#0284c7',
  'message-publish': '#4f46e5',
  'message-consume': '#4f46e5',
  transformation: '#0d9488',
  authentication: '#c026d3',
  authorization: '#c026d3',
  transaction: '#475569',
  response: '#059669',
  error: '#dc2626',
  'system-boundary': '#334155',
};

const EDGE_COLOR: Partial<Record<BegEdgeType, string>> = {
  error: '#dc2626',
  success: '#059669',
};

/** Cytoscape node/edge `data` shape — exported so consumers (styling, click handlers) can read it back typed instead of casting `unknown`. */
export interface GraphNodeData {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly technicalName: string;
  readonly confidence: number;
  readonly nodeType: BegNodeType;
  readonly lowConfidence: boolean;
  readonly color: string;
  readonly shape: string;
}

export interface GraphEdgeData {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly edgeType: BegEdgeType;
  readonly label: string;
  readonly color: string;
}

/** Converts a validated BEG into Cytoscape elements — the only place graph-schema's shape meets Cytoscape's. Pure and DOM-free, so it's unit-testable without a browser. */
export function toCytoscapeElements(graph: BegGraph): ElementDefinition[] {
  const nodes: ElementDefinition[] = graph.nodes.map((node) => {
    const data: GraphNodeData = {
      id: node.id,
      label: node.businessName,
      description: node.businessDescription,
      technicalName: node.technicalName,
      confidence: node.confidence,
      nodeType: node.type,
      lowConfidence: node.confidence < LOW_CONFIDENCE_THRESHOLD,
      color: NODE_COLOR[node.type],
      shape: NODE_SHAPE[node.type],
    };
    return { data, classes: `node-${node.type}` };
  });

  const edges: ElementDefinition[] = graph.edges.map((edge) => {
    const data: GraphEdgeData = {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      edgeType: edge.type,
      label: edge.label ?? '',
      color: EDGE_COLOR[edge.type] ?? '#94a3b8',
    };
    return { data, classes: `edge-${edge.type}` };
  });

  return [...nodes, ...edges];
}
