# @flowscope/business-analyzer

Arguably the most important package in FlowScope (`MASTER_PLAN.md` §12–13):
infers business-meaningful steps (e.g. `createUser()` → "Register
Customer") from technical semantic models using method/class names,
annotations, call relationships, parameters, return types, string
constants, repository operations, HTTP mappings, exception handling,
conditional branches, external calls, database operations, and domain
vocabulary.

**Every inferred business name/description carries a numeric `confidence`
value — inference is never presented as certain.** Low-confidence results
must be identifiable as such by consumers (the UI marks them "Inferred" /
"Low confidence"). Produces the Business Semantic Model consumed by
`packages/graph-engine`'s `GraphBuilder`.

Depends on the technical semantic models (via `packages/parser-core` /
`packages/parser-spring` output shapes) but must never depend on React,
Electron, or Cytoscape (`docs/ARCHITECTURE.md`).

**Status:** not yet implemented — see `docs/sprints/SPRINT-1.md` /
Weekend 5.
