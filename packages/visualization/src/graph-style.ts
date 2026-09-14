import type { StylesheetJson } from 'cytoscape';

export type GraphTheme = 'light' | 'dark';

interface ThemePalette {
  readonly nodeBackground: string;
  readonly nodeText: string;
  readonly edgeLabelBackground: string;
  readonly edgeLabelText: string;
}

const PALETTE: Record<GraphTheme, ThemePalette> = {
  light: {
    nodeBackground: '#ffffff',
    nodeText: '#1e293b',
    edgeLabelBackground: '#f8fafc',
    edgeLabelText: '#334155',
  },
  dark: {
    nodeBackground: '#1e293b',
    nodeText: '#f1f5f9',
    edgeLabelBackground: '#0f172a',
    edgeLabelText: '#cbd5e1',
  },
};

/**
 * The shared Cytoscape stylesheet — node shape/color/label come from
 * `data()` (set in `toCytoscapeElements`) rather than per-type selectors,
 * since the node-type vocabulary is extensible (docs/architecture/graph-model.md)
 * and this way a new type never needs a matching style rule.
 */
export function getStylesheet(theme: GraphTheme): StylesheetJson {
  const palette = PALETTE[theme];

  return [
    {
      selector: 'node',
      style: {
        shape: 'data(shape)' as unknown as 'ellipse',
        'background-color': palette.nodeBackground,
        'border-width': 3,
        'border-color': 'data(color)',
        'border-style': 'solid',
        label: 'data(label)',
        color: palette.nodeText,
        'text-wrap': 'wrap',
        'text-max-width': '140px',
        'font-size': '12px',
        'font-weight': 600,
        'text-valign': 'center',
        'text-halign': 'center',
        padding: '14px',
        width: 'label',
        height: 'label',
      },
    },
    {
      selector: 'node[?lowConfidence]',
      style: {
        'border-style': 'dashed',
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 5,
        'overlay-color': 'data(color)',
        'overlay-opacity': 0.15,
        'overlay-padding': 6,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 2,
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': '11px',
        'font-weight': 700,
        color: palette.edgeLabelText,
        'text-background-color': palette.edgeLabelBackground,
        'text-background-opacity': 1,
        'text-background-padding': '3px',
        'text-rotation': 'autorotate',
      },
    },
    {
      selector: 'edge.edge-sequence',
      style: {
        'line-style': 'solid',
      },
    },
    {
      selector: 'edge.edge-conditional, edge.edge-loop',
      style: {
        'line-style': 'dashed',
      },
    },
  ];
}
