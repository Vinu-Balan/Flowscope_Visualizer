import type { BegGraph } from '@flowscope/graph-schema';
import { describe, expect, it } from 'vitest';
import {
  LOW_CONFIDENCE_THRESHOLD,
  NODE_COLOR,
  NODE_SHAPE,
  toCytoscapeElements,
} from './graph-elements';

const graph: BegGraph = {
  id: 'g1',
  apiId: 'api1',
  nodes: [
    {
      id: 'n1',
      type: 'decision',
      businessName: 'Check if Customer Exists',
      businessDescription: 'Checks whether a customer already exists.',
      confidence: 0.75,
      technicalName: 'existsByEmail(...)',
    },
    {
      id: 'n2',
      type: 'business-step',
      businessName: 'Do The Thing',
      businessDescription: 'A low-confidence fallback step.',
      confidence: 0.35,
      technicalName: 'doTheThing()',
    },
  ],
  edges: [{ id: 'e1', from: 'n1', to: 'n2', type: 'error', label: 'Yes' }],
};

describe('toCytoscapeElements', () => {
  it('produces one Cytoscape element per node and edge', () => {
    const elements = toCytoscapeElements(graph);
    expect(elements).toHaveLength(3);
  });

  it('carries node business content, shape, and color through to element data', () => {
    const elements = toCytoscapeElements(graph);
    const node = elements.find((el) => el.data.id === 'n1');
    expect(node?.data).toMatchObject({
      id: 'n1',
      label: 'Check if Customer Exists',
      description: 'Checks whether a customer already exists.',
      technicalName: 'existsByEmail(...)',
      confidence: 0.75,
      nodeType: 'decision',
      shape: NODE_SHAPE.decision,
      color: NODE_COLOR.decision,
    });
  });

  it('flags a node below the low-confidence threshold', () => {
    const elements = toCytoscapeElements(graph);
    const lowConfidenceNode = elements.find((el) => el.data.id === 'n2');
    const highConfidenceNode = elements.find((el) => el.data.id === 'n1');
    expect(lowConfidenceNode?.data.lowConfidence).toBe(true);
    expect(highConfidenceNode?.data.lowConfidence).toBe(false);
    expect(0.35).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
  });

  it('carries edge type, label, and source/target through to element data', () => {
    const elements = toCytoscapeElements(graph);
    const edge = elements.find((el) => el.data.id === 'e1');
    expect(edge?.data).toMatchObject({
      id: 'e1',
      source: 'n1',
      target: 'n2',
      edgeType: 'error',
      label: 'Yes',
    });
  });

  it('defaults an edge with no label to an empty string, never undefined', () => {
    const plainGraph: BegGraph = {
      ...graph,
      edges: [{ id: 'e1', from: 'n1', to: 'n2', type: 'sequence' }],
    };
    const elements = toCytoscapeElements(plainGraph);
    const edge = elements.find((el) => el.data.id === 'e1');
    expect(edge?.data.label).toBe('');
  });

  it('produces every node with a distinct type-specific CSS class', () => {
    const elements = toCytoscapeElements(graph);
    const node = elements.find((el) => el.data.id === 'n1');
    expect(node?.classes).toBe('node-decision');
  });
});
