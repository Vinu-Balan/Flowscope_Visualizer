# @flowscope/graph-engine

The canonical in-memory Business Execution Graph domain model
(`docs/adr/ADR-002-business-execution-graph.md`,
`docs/architecture/domain-model.md`). Owns graph construction (`GraphBuilder`),
validation (`GraphValidator`, see `docs/architecture/analysis-pipeline.md`
for the required checks), querying, and — critically — projecting one BEG
into the business/developer/technical detail levels (`MASTER_PLAN.md` §6)
at read time, without regenerating the graph.

Implements `buildGraph(flow: BusinessFlow): Result<BegGraph, GraphBuildError>`
— assembles and validates a BEG from `packages/business-analyzer`'s
inferred flow (nodes _and_ explicit edges — a decision's two branches map
onto two real `BegEdge`s, not one inferred from array adjacency, since
Sprint 6), and `projectGraph(graph, level)` — the business/developer/
technical label projection described above. Only `projectGraph` is
exercised so far; nothing in `apps/desktop` switches detail levels yet
(that's Sprint 7's UI work), but the underlying contract is real and
tested now.

Depends on `packages/graph-schema`, `packages/business-analyzer` (for the
`BusinessFlow` input type), and `packages/core`. Must never depend on
Spring, Electron, or React (`docs/ARCHITECTURE.md`).

**Status:** implemented — see `docs/sprints/SPRINT-5.md` / Weekend 5 and
`docs/sprints/SPRINT-6.md` / Weekend 6.
