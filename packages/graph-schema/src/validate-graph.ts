import { BegGraphSchema, type BegGraph } from './graph-model';

export interface GraphValidationResult {
  readonly valid: boolean;
  /** Actionable diagnostics (docs/architecture/graph-model.md) — empty when `valid` is true. */
  readonly issues: readonly string[];
}

/**
 * Rejects, with actionable diagnostics, a graph that isn't well-formed:
 * duplicate node ids, edges referencing missing nodes, an out-of-range
 * confidence value, an unrecognized node/edge type, or a missing required
 * field — see docs/architecture/graph-model.md's `GraphValidator`
 * contract. Accepts `unknown` so it can validate a graph that just
 * crossed the IPC boundary, not only one already known to be well-typed.
 */
export function validateGraph(candidate: unknown): GraphValidationResult {
  const result = BegGraphSchema.safeParse(candidate);
  if (result.success) {
    return { valid: true, issues: [] };
  }
  return {
    valid: false,
    issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  };
}

export function isValidGraph(candidate: unknown): candidate is BegGraph {
  return BegGraphSchema.safeParse(candidate).success;
}
