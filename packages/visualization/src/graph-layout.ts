import type { LayoutOptions } from 'cytoscape';

/**
 * ELK's layered algorithm, top-to-bottom — the standard flowchart reading
 * direction (MASTER_PLAN.md §9 names Cytoscape.js + ELK.js explicitly).
 * Positions are always computed, never hard-coded
 * (`packages/visualization/README.md`).
 */
export function getLayoutOptions(): LayoutOptions {
  return {
    name: 'elk',
    fit: true,
    padding: 40,
    elk: {
      algorithm: 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': 48,
      'elk.layered.spacing.nodeNodeBetweenLayers': 64,
      'elk.layered.spacing.edgeNodeBetweenLayers': 32,
      'elk.edgeRouting': 'ORTHOGONAL',
    },
  } as unknown as LayoutOptions;
}
