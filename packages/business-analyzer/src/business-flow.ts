import type { BegEdgeType, BegNodeType, BegSourceLocation } from '@flowscope/graph-schema';

/**
 * `packages/business-analyzer`'s own output contract — one inferred,
 * confidence-scored step in a business flow (docs/architecture/domain-model.md).
 * Reuses `packages/graph-schema`'s node/edge type vocabulary directly
 * rather than a parallel enum, since a `BusinessStep` becomes a `BegNode`
 * one-for-one in `packages/graph-engine`'s `buildGraph`.
 */
export interface BusinessStep {
  readonly id: string;
  readonly type: BegNodeType;
  readonly businessName: string;
  readonly businessDescription: string;
  /** Never presented as certain (MASTER_PLAN.md §12) — in [0, 1]. */
  readonly confidence: number;
  readonly technicalName: string;
  readonly source: BegSourceLocation;
}

/**
 * An explicit control-flow edge between two steps — a decision step has
 * two of these (its guard-clause outcome and the branch that resumes
 * normal flow), not one, so the flow is a real branching graph rather
 * than a flattened list (docs/sprints/SPRINT-6.md).
 */
export interface BusinessFlowEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type: BegEdgeType;
  /** A short, human label for a decision's branch — "Yes" / "No" — absent on a plain sequential edge. */
  readonly label?: string;
}

export interface BusinessFlow {
  readonly apiId: string;
  readonly steps: readonly BusinessStep[];
  readonly edges: readonly BusinessFlowEdge[];
}
