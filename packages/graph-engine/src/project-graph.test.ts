import type { BegGraph } from '@flowscope/graph-schema';
import { describe, expect, it } from 'vitest';
import { projectGraph } from './project-graph';

const graph: BegGraph = {
  id: 'g1',
  apiId: 'api1',
  nodes: [
    {
      id: 'n1',
      type: 'business-step',
      businessName: 'Register Customer',
      businessDescription: 'Registers a new customer.',
      confidence: 0.9,
      technicalName: 'CustomerController.register()',
    },
  ],
  edges: [],
};

describe('projectGraph', () => {
  it('labels business-level nodes with just the business name', () => {
    const projected = projectGraph(graph, 'business');
    expect(projected.nodes[0]?.label).toBe('Register Customer');
  });

  it('labels technical-level nodes with just the technical name', () => {
    const projected = projectGraph(graph, 'technical');
    expect(projected.nodes[0]?.label).toBe('CustomerController.register()');
  });

  it('labels developer-level nodes with both names', () => {
    const projected = projectGraph(graph, 'developer');
    expect(projected.nodes[0]?.label).toBe('Register Customer (CustomerController.register())');
  });

  it('preserves every other field on the node unchanged', () => {
    const projected = projectGraph(graph, 'business');
    expect(projected.nodes[0]).toMatchObject(graph.nodes[0] as object);
  });

  it('preserves edges and top-level identity unchanged', () => {
    const projected = projectGraph(graph, 'business');
    expect(projected.id).toBe('g1');
    expect(projected.apiId).toBe('api1');
    expect(projected.edges).toEqual(graph.edges);
  });
});
