# @flowscope/visualization

The graph rendering layer: renders a `BegGraph` (as built by
`packages/graph-engine`) using Cytoscape.js for interaction (zoom, pan,
selection) and ELK.js for automatic layout (`MASTER_PLAN.md` §9). Graph
positions are always computed (ELK's layered algorithm, top-to-bottom),
never hard-coded.

Mostly a pure, DOM-free API, unit-tested without a browser:
`toCytoscapeElements` (BEG → Cytoscape elements, carrying node
shape/color/label and edge type/label/color through `data()`),
`getStylesheet` (theme-aware styling — decision nodes render as diamonds,
everything else as rounded rectangles; low-confidence nodes get a dashed
border), and `getLayoutOptions` (the ELK layered/top-to-bottom config).
`createGraphView` is the one function that actually touches Cytoscape's
imperative API — instantiates the graph in a given DOM container, wires
node-tap → selection, and hands back the live `Core` instance for the
caller to `.destroy()` on unmount.

Receives a graph model and a theme; has no knowledge of Spring, Java, or
IPC. Browser-only (renders to a DOM canvas) — consumed only by
`apps/desktop`'s renderer, never main or preload
(`docs/ARCHITECTURE.md`).

**Status:** implemented — see `docs/sprints/SPRINT-6.md` / Weekend 6.
