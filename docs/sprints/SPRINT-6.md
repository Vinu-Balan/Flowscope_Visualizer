# SPRINT-6: Graph Visualization (Weekend 6)

## Goal

An interactive BEG canvas — the visible result defined in
`docs/ROADMAP.md`'s ten-weekend plan. Selecting an API now renders a real,
pannable/zoomable flowchart (Cytoscape.js + ELK.js, `MASTER_PLAN.md` §9)
instead of Sprint 5's step list: decision nodes are diamonds with two
outgoing edges labeled "Yes"/"No", not a single flattened chain. This
sprint was prompted directly by user feedback on Sprint 5's list-based
rendering: "I need the graph generated to be showing all the decision
control to show how the flow of control flows... a understandable
flowchart... Every node must make more sense with proper details."

## Architecture touched

- `packages/business-analyzer`: **the underlying flow model changed**,
  not just its rendering. `BusinessFlow` now carries an explicit `edges`
  array (`BusinessFlowEdge[]`) instead of each `BusinessStep` carrying a
  single `incomingEdgeType` describing its link to the _previous array
  entry_. A decision's guard-clause outcome and its normal-flow
  continuation both now connect directly from the decision node — a real
  branch, not two links in one chain. `describeDecision` gained
  `affirmativeBranch: 'guard' | 'continue'`, fixing a real correctness
  bug this rework surfaced: `customer == null` phrased as "Check if
  Customer was Found" has its raw-true branch mean "No" (not found), not
  "Yes" — the edge label now follows the _phrased question_, not raw Java
  truth.
- `packages/graph-engine`: `buildGraph` now maps `BusinessFlow.edges`
  directly onto `BegEdge[]` (previously it inferred edges from step-array
  adjacency).
- `packages/visualization`: first real implementation. Cytoscape.js +
  ELK.js (`cytoscape`, `cytoscape-elk`), wrapped in a small, mostly-pure
  API: `toCytoscapeElements` (BEG → Cytoscape elements, unit-tested
  without a browser), `getStylesheet` (theme-aware node/edge styling —
  diamonds for decisions, rounded rectangles for everything else, dashed
  borders for low-confidence nodes), `getLayoutOptions` (ELK layered,
  top-to-bottom), and `createGraphView` (the one place that touches
  Cytoscape's imperative API — instantiates, wires node-click selection,
  hands back the `Core` instance for the caller to `.destroy()`).
- `apps/desktop`: `business-flow-panel.tsx` now renders `GraphCanvas` (a
  `useEffect`-managed Cytoscape instance) instead of a step list. A new
  `node-detail-panel.tsx` fills the previously-static right-hand "No node
  selected" panel with the selected node's full detail (business
  description, confidence, technical name, source file/line) — the graph
  itself keeps node labels short and legible; full detail lives here. New
  `selectedNodeId` app-store state, cleared whenever the selected API
  changes. A new `useResolvedTheme` hook feeds the current light/dark
  theme to the graph (Cytoscape styles aren't CSS, so they can't just
  inherit `data-theme`).

## Planned scope

- Branch construction: an `if` guard's outcome (`throw`/early `return`)
  connects from the decision with edge type `'error'`; the branch that
  resumes normal flow connects from the _same_ decision with edge type
  `'success'`. Edge type reflects the actual outcome (error path vs.
  continuing path) independent of the Yes/No label, which reflects the
  _phrased_ decision question instead of raw condition truth.
- Visual language: decision = diamond, everything else = rounded
  rectangle (the two shapes standard flowchart vocabulary needs). One
  accent color per node type (`NODE_COLOR`), used for both the node
  border and, implicitly, its identity in the graph. Low-confidence nodes
  (`confidence < 0.6`, matching Sprint 5's threshold) get a dashed border.
  Edges: gray for `sequence`, green for `success`, red for `error`,
  dashed for `conditional`/`loop`.
- Node labels stay short (the business name only); a node's business
  description, confidence, technical name, and source location are only
  ever shown in the side detail panel on selection — keeps the canvas
  legible without hiding information the user needs.
- ELK's layered algorithm, direction `DOWN` (top-to-bottom, the standard
  flowchart reading order), orthogonal edge routing.

## Explicitly deferred to later sprints

The Inspector's full feature set (multi-level business/developer/
technical switching in the UI — `projectGraph` exists and is tested since
Sprint 5, but nothing calls it yet; a working "Open Source" jump to
Monaco) — Sprint 7/8. Search — Sprint 9. Graph export/save. Loops,
switch, try/catch, and lambdas remain unmodeled in body-event extraction
(unchanged from Sprint 5). Edge routing/layout polish beyond ELK's
defaults (manual node dragging persistence, minimap, etc.).

## Acceptance criteria

- [x] `business-analyzer` produces a real branch for `POST /customers`:
      the decision node has exactly two outgoing edges — one to `Reject
Customer` (type `error`, label "Yes"), one to `Generate Customer`
      (type `success`, label "No") — verified against the real fixture,
      not hand-built models.
- [x] `business-analyzer` produces a real branch for
      `GET /customers/{id}` with edge labels matching the _phrased_
      decision question rather than raw Java truth: "Check if Customer
      was Found" → "No" → `Return Not Found Response`, "Yes" →
      `Return Response`.
- [x] `graph-engine`'s `buildGraph` maps explicit flow edges (including
      labels) onto the BEG one-for-one and still rejects an invalid graph
      (duplicate id, dangling edge reference).
- [x] `packages/visualization`'s `toCytoscapeElements` carries node
      shape/color/label and edge type/label/color through to Cytoscape's
      element data, unit-tested without a browser.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` are all
      clean — 32 test files, 205 tests, across the whole workspace.
- [x] Verified by launching the actual built app against the real
      `simple-customer-service` fixture: `POST /customers` renders a
      diamond decision node with a red "Yes" edge to "Reject Customer"
      and a green "No" edge continuing to "Generate Customer" → "Save
      Customer" → "Return Response"; `GET /customers/{id}` renders its
      own distinct flowchart with "No"/"Yes" correctly matching "Check if
      Customer was Found". Clicking a node populates the right-hand panel
      with its full business description, confidence, technical name,
      and source file/line. The preload bundle (`out/preload/index.js`)
      was grepped and confirmed free of `node:fs`, `java-parser`,
      `chevrotain`, and `cytoscape`.

## Status

Complete.
