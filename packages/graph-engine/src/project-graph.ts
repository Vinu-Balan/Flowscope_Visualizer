import type { BegEdge, BegGraph, BegNode } from '@flowscope/graph-schema';

/**
 * The three presentation levels a BEG projects into (MASTER_PLAN.md §6) —
 * switching levels is a read-time transform of the same graph, never a
 * different generated graph (docs/architecture/domain-model.md). Nothing
 * in `apps/desktop` calls this yet (Sprint 5 only renders the business
 * level); it exists now so the projection contract is real and tested
 * before the UI needs it (Sprint 6/7).
 */
export const DETAIL_LEVELS = ['business', 'developer', 'technical'] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

export interface ProjectedNode extends BegNode {
  readonly label: string;
}

export interface ProjectedGraph {
  readonly id: string;
  readonly apiId: string;
  readonly nodes: readonly ProjectedNode[];
  readonly edges: readonly BegEdge[];
}

function labelFor(node: BegNode, level: DetailLevel): string {
  if (level === 'business') {
    return node.businessName;
  }
  if (level === 'technical') {
    return node.technicalName;
  }
  return `${node.businessName} (${node.technicalName})`;
}

export function projectGraph(graph: BegGraph, level: DetailLevel): ProjectedGraph {
  return {
    id: graph.id,
    apiId: graph.apiId,
    nodes: graph.nodes.map((node) => ({ ...node, label: labelFor(node, level) })),
    edges: graph.edges,
  };
}
