# @flowscope/graph-schema

The Business Execution Graph schema: zod schemas and TypeScript types for
a `BegGraph` (nodes + edges), covering the full extensible node/edge type
vocabulary from `docs/architecture/graph-model.md`, plus `validateGraph` —
rejects, with actionable diagnostics, a graph with duplicate node ids,
edges referencing missing nodes, an out-of-range confidence value, an
unrecognized node/edge type, or a missing required field.

The full multi-graph `flowscope.json` document wrapper (project identity,
analysis metadata, an array of graphs) described in
`docs/architecture/graph-model.md` — and `docs/adr/ADR-005-graph-schema-versioning.md`'s
compatibility rules — aren't implemented yet; what's here is exactly the
single-graph-per-API shape that crosses IPC today (docs/sprints/SPRINT-5.md).
It lands whenever disk persistence/caching does.

**Framework-independent by hard rule**: must never depend on Spring,
Electron, or React (`docs/ARCHITECTURE.md`). This is what keeps the BEG
reusable across future non-Spring adapters (`MASTER_PLAN.md` §14). The
whole package has zero Node dependencies, so unlike most other packages
here it needs no isomorphic/Node-only split — its one entry point is safe
to import directly from the renderer.

**Status:** implemented — see `docs/sprints/SPRINT-5.md` / Weekend 5.
