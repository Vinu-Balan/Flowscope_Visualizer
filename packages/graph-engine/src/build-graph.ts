import type { BusinessFlow } from '@flowscope/business-analyzer';
import { GraphBuildError, err, ok, type Result } from '@flowscope/core';
import { validateGraph, type BegEdge, type BegGraph, type BegNode } from '@flowscope/graph-schema';

/**
 * Assembles a validated BEG from `packages/business-analyzer`'s inferred
 * flow (docs/architecture/analysis-pipeline.md's `GraphBuilder` +
 * `GraphValidator` stages, combined — there's no separate "graph
 * assembly" step worth splitting out yet). A near-direct translation:
 * `business-analyzer` already builds the real branching structure (a
 * decision's two outcomes, not a flattened chain — docs/sprints/SPRINT-6.md),
 * so this just maps `BusinessStep`/`BusinessFlowEdge` onto `BegNode`/`BegEdge`
 * one-for-one and validates the result.
 */
export function buildGraph(flow: BusinessFlow): Result<BegGraph, GraphBuildError> {
  const nodes: BegNode[] = flow.steps.map((step) => ({
    id: step.id,
    type: step.type,
    businessName: step.businessName,
    businessDescription: step.businessDescription,
    confidence: step.confidence,
    technicalName: step.technicalName,
    source: step.source,
  }));

  const edges: BegEdge[] = flow.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    type: edge.type,
    ...(edge.label ? { label: edge.label } : {}),
  }));

  const graph: BegGraph = { id: flow.apiId, apiId: flow.apiId, nodes, edges };

  const validation = validateGraph(graph);
  if (!validation.valid) {
    return err(
      new GraphBuildError({
        message: `Built an invalid business flow graph for API "${flow.apiId}": ${validation.issues.join('; ')}`,
        context: { apiId: flow.apiId, issues: validation.issues },
      }),
    );
  }

  return ok(graph);
}
