import { describe, expect, it } from 'vitest';
import { validateGraph } from './validate-graph';
import type { BegEdge, BegGraph, BegNode } from './graph-model';

function node(overrides: Partial<BegNode> & Pick<BegNode, 'id'>): BegNode {
  return {
    type: 'business-step',
    businessName: 'Do Something',
    businessDescription: 'Does something.',
    confidence: 0.8,
    technicalName: 'doSomething()',
    ...overrides,
  };
}

function edge(overrides: Partial<BegEdge> & Pick<BegEdge, 'id' | 'from' | 'to'>): BegEdge {
  return { type: 'sequence', ...overrides };
}

function graph(overrides: Partial<BegGraph> = {}): BegGraph {
  return { id: 'g1', apiId: 'api1', nodes: [], edges: [], ...overrides };
}

describe('validateGraph', () => {
  it('accepts a well-formed graph', () => {
    const result = validateGraph(
      graph({
        nodes: [node({ id: 'n1' }), node({ id: 'n2' })],
        edges: [edge({ id: 'e1', from: 'n1', to: 'n2' })],
      }),
    );
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it('accepts a graph with no nodes or edges', () => {
    expect(validateGraph(graph())).toEqual({ valid: true, issues: [] });
  });

  it('rejects a duplicate node id', () => {
    const result = validateGraph(graph({ nodes: [node({ id: 'n1' }), node({ id: 'n1' })] }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes('Duplicate node id "n1"'))).toBe(true);
  });

  it('rejects an edge referencing a missing "from" node', () => {
    const result = validateGraph(
      graph({
        nodes: [node({ id: 'n1' })],
        edges: [edge({ id: 'e1', from: 'missing', to: 'n1' })],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes('missing node "missing"'))).toBe(true);
  });

  it('rejects an edge referencing a missing "to" node', () => {
    const result = validateGraph(
      graph({
        nodes: [node({ id: 'n1' })],
        edges: [edge({ id: 'e1', from: 'n1', to: 'missing' })],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.includes('missing node "missing"'))).toBe(true);
  });

  it('rejects an out-of-range confidence value', () => {
    const result = validateGraph(graph({ nodes: [node({ id: 'n1', confidence: 1.5 })] }));
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects an unrecognized node type', () => {
    const badGraph = graph({
      nodes: [{ ...node({ id: 'n1' }), type: 'not-a-real-type' } as unknown as BegNode],
    });
    const result = validateGraph(badGraph);
    expect(result.valid).toBe(false);
  });

  it('rejects a missing required field', () => {
    const result = validateGraph({ id: 'g1', apiId: 'api1', nodes: [{ id: 'n1' }], edges: [] });
    expect(result.valid).toBe(false);
  });

  it('rejects a completely malformed candidate without throwing', () => {
    const result = validateGraph('not a graph at all');
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
