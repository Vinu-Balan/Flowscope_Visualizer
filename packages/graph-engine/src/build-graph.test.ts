import type { BusinessFlow, BusinessFlowEdge, BusinessStep } from '@flowscope/business-analyzer';
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
    ...overrides,
  };
}

function edge(
  overrides: Partial<BusinessFlowEdge> & Pick<BusinessFlowEdge, 'id' | 'from' | 'to'>,
): BusinessFlowEdge {
  return { type: 'sequence', ...overrides };
}

describe('buildGraph', () => {
  it('builds one node with no edges for a single-step flow', () => {
    const flow: BusinessFlow = { apiId: 'api1', steps: [step({ id: 'n1' })], edges: [] };
    const result = buildGraph(flow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toHaveLength(1);
    expect(result.value.edges).toEqual([]);
    expect(result.value.id).toBe('api1');
    expect(result.value.apiId).toBe('api1');
  });

  it('maps explicit edges one-for-one, including labels', () => {
    const flow: BusinessFlow = {
      apiId: 'api1',
      steps: [step({ id: 'n1' }), step({ id: 'n2' }), step({ id: 'n3', type: 'error' })],
      edges: [
        edge({ id: 'e1', from: 'n1', to: 'n2', type: 'sequence' }),
        edge({ id: 'e2', from: 'n2', to: 'n3', type: 'error', label: 'Yes' }),
      ],
    };
    const result = buildGraph(flow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.edges).toEqual([
      { id: 'e1', from: 'n1', to: 'n2', type: 'sequence' },
      { id: 'e2', from: 'n2', to: 'n3', type: 'error', label: 'Yes' },
    ]);
  });

  it('builds a real branch: two edges out of one decision node', () => {
    const flow: BusinessFlow = {
      apiId: 'api1',
      steps: [
        step({ id: 'n1' }),
        step({ id: 'decision', type: 'decision' }),
        step({ id: 'rejected', type: 'error' }),
        step({ id: 'continued' }),
      ],
      edges: [
        edge({ id: 'e1', from: 'n1', to: 'decision' }),
        edge({ id: 'e2', from: 'decision', to: 'rejected', type: 'error', label: 'Yes' }),
        edge({ id: 'e3', from: 'decision', to: 'continued', type: 'success', label: 'No' }),
      ],
    };
    const result = buildGraph(flow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const outgoingFromDecision = result.value.edges.filter((e) => e.from === 'decision');
    expect(outgoingFromDecision).toHaveLength(2);
    expect(outgoingFromDecision.map((e) => e.to).sort()).toEqual(['continued', 'rejected']);
  });

  it('builds an empty graph for a flow with no steps', () => {
    const flow: BusinessFlow = { apiId: 'api1', steps: [], edges: [] };
    const result = buildGraph(flow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toEqual([]);
    expect(result.value.edges).toEqual([]);
  });

  it('fails with a GraphBuildError rather than building an invalid graph, if steps share an id', () => {
    const flow: BusinessFlow = {
      apiId: 'api1',
      steps: [step({ id: 'dup' }), step({ id: 'dup' })],
      edges: [],
    };
    const result = buildGraph(flow);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('GRAPH_BUILD_ERROR');
  });

  it('fails with a GraphBuildError if an edge references a missing node', () => {
    const flow: BusinessFlow = {
      apiId: 'api1',
      steps: [step({ id: 'n1' })],
      edges: [edge({ id: 'e1', from: 'n1', to: 'missing' })],
    };
    const result = buildGraph(flow);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('GRAPH_BUILD_ERROR');
  });
});
