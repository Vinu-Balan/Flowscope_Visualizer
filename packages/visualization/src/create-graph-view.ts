import type { BegGraph } from '@flowscope/graph-schema';
import cytoscape, { type Core, type EventObjectNode } from 'cytoscape';
import elk from 'cytoscape-elk';
import { toCytoscapeElements } from './graph-elements';
import { getLayoutOptions } from './graph-layout';
import { getStylesheet, type GraphTheme } from './graph-style';

let elkRegistered = false;

function ensureElkRegistered(): void {
  if (!elkRegistered) {
    cytoscape.use(elk);
    elkRegistered = true;
  }
}

export interface CreateGraphViewOptions {
  readonly theme: GraphTheme;
  /** Called with the tapped node's id, or `null` when the background is tapped (deselecting). */
  readonly onSelectNode?: (nodeId: string | null) => void;
}

/**
 * Renders a validated BEG into `container` as an interactive Cytoscape
 * graph, laid out by ELK. The only place in the codebase that touches
 * Cytoscape's imperative API directly — `apps/desktop`'s React component
 * calls this from a `useEffect` and calls `.destroy()` on cleanup; it
 * never imports `cytoscape` itself (docs/architecture — UI has no direct
 * dependency on rendering internals).
 */
export function createGraphView(
  container: HTMLElement,
  graph: BegGraph,
  options: CreateGraphViewOptions,
): Core {
  ensureElkRegistered();

  const cy = cytoscape({
    container,
    elements: toCytoscapeElements(graph),
    style: getStylesheet(options.theme),
    layout: getLayoutOptions(),
    wheelSensitivity: 0.2,
    minZoom: 0.2,
    maxZoom: 2.5,
  });

  const onSelectNode = options.onSelectNode;
  if (onSelectNode) {
    cy.on('tap', 'node', (event: EventObjectNode) => {
      onSelectNode(event.target.id());
    });
    cy.on('tap', (event) => {
      if (event.target === cy) {
        onSelectNode(null);
      }
    });
  }

  return cy;
}
