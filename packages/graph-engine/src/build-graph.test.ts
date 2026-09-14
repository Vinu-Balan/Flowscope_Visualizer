import type { BusinessFlow, BusinessStep } from '@flowscope/business-analyzer';
import { describe, expect, it } from 'vitest';
import { buildGraph } from './build-graph';

function step(overrides: Partial<BusinessStep> & Pick<BusinessStep, 'id'>): BusinessStep {
  return {
    type: 'business-step',
    businessName: 'Do Something',
    businessDescription: 'Does something.',
    confidence: 0.8,
    technicalName: 'doSomething()',
    source: { file: 'A.java', lineStart: 1, lineEnd: 1 },
    incomingEdgeType: 'sequence',
    ...overrides,
  };
}

describe('buildGraph', () => {
  it('builds one node with no edges for a single-step flow', () => {
    const flow: BusinessFlow = { apiId: 'api1', steps: [step({ id: 'n1' })] };
    const result = buildGraph(flow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toHaveLength(1);
    expect(result.value.edges).toEqual([]);
    expect(result.value.id).toBe('api1');
    expect(result.value.apiId).toBe('api1');
  });

  it('connects consecutive steps with sequence edges typed by the target step', () => {
    const flow: BusinessFlow = {
      apiId: 'api1',
      steps: [
        step({ id: 'n1' }),
        step({ id: 'n2', incomingEdgeType: 'sequence' }),
        step({ id: 'n3', type: 'error', incomingEdgeType: 'error' }),
      ],
    };
    const result = buildGraph(flow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.edges).toEqual([
      { id: 'n1->n2', from: 'n1', to: 'n2', type: 'sequence' },
      { id: 'n2->n3', from: 'n2', to: 'n3', type: 'error' },
    ]);
  });

  it('builds an empty graph for a flow with no steps', () => {
    const flow: BusinessFlow = { apiId: 'api1', steps: [] };
    const result = buildGraph(flow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toEqual([]);
    expect(result.value.edges).toEqual([]);
  });

  it('fails with a GraphBuildError rather than building an invalid graph, if steps share an id', () => {
    const flow: BusinessFlow = { apiId: 'api1', steps: [step({ id: 'dup' }), step({ id: 'dup' })] };
    const result = buildGraph(flow);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('GRAPH_BUILD_ERROR');
  });
});
