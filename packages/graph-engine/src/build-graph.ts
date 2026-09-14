import type { BusinessFlow } from '@flowscope/business-analyzer';
import { GraphBuildError, err, ok, type Result } from '@flowscope/core';
import { validateGraph, type BegEdge, type BegGraph, type BegNode } from '@flowscope/graph-schema';

/**
 * Assembles a validated BEG from `packages/business-analyzer`'s inferred
 * step sequence (docs/architecture/analysis-pipeline.md's `GraphBuilder` +
 * `GraphValidator` stages, combined — Sprint 5's flows are always a
 * straight-line sequence, so there's no separate "graph assembly" step
 * worth splitting out yet). Each consecutive pair of steps becomes one
 * edge, typed by the *later* step's `incomingEdgeType`.
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

  const edges: BegEdge[] = [];
  for (let index = 1; index < flow.steps.length; index += 1) {
    const previous = flow.steps[index - 1];
    const current = flow.steps[index];
    if (!previous || !current) {
      continue;
    }
    edges.push({
      id: `${previous.id}->${current.id}`,
      from: previous.id,
      to: current.id,
      type: current.incomingEdgeType,
    });
  }

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
