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
  /**
   * How this step connects from the previous one in the flow —
   * `'sequence'` for the happy path, `'error'` for a decision's
   * rejected/alternate outcome (docs/sprints/SPRINT-5.md). Ignored for
   * the first step, which has no incoming edge.
   */
  readonly incomingEdgeType: BegEdgeType;
}

export interface BusinessFlow {
  readonly apiId: string;
  readonly steps: readonly BusinessStep[];
}
