# @flowscope/graph-schema

The versioned `flowscope.json` schema: TypeScript types, JSON Schema (or
equivalent), and validators for the serialized Business Execution Graph —
see `docs/architecture/graph-model.md` for the target shape, node/edge
types, and `docs/adr/ADR-005-graph-schema-versioning.md` for the
compatibility rules.

**Framework-independent by hard rule**: must never depend on Spring,
Electron, or React (`docs/ARCHITECTURE.md`). This is what keeps the BEG
reusable across future non-Spring adapters (`MASTER_PLAN.md` §14).

**Status:** not yet implemented — see `docs/sprints/SPRINT-1.md`.
