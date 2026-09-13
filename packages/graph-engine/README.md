# @flowscope/graph-engine

The canonical in-memory Business Execution Graph domain model
(`docs/adr/ADR-002-business-execution-graph.md`,
`docs/architecture/domain-model.md`). Owns graph construction (`GraphBuilder`),
validation (`GraphValidator`, see `docs/architecture/analysis-pipeline.md`
for the required checks), querying, and — critically — projecting one BEG
into the business/developer/technical detail levels (`MASTER_PLAN.md` §6)
at read time, without regenerating the graph.

Depends on `packages/graph-schema` and `packages/core` only. Must never
depend on Spring, Electron, or React (`docs/ARCHITECTURE.md`).

**Status:** not yet implemented — see `docs/sprints/SPRINT-1.md` /
Weekend 5–6.
