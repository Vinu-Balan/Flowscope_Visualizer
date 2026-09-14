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
"Low confidence"). Produces `inferBusinessFlow(api, projectFiles):
Result<BusinessFlow, AnalysisError>` — `packages/graph-engine`'s
`buildGraph` maps the result onto a BEG one-for-one.

Implemented so far (`docs/sprints/SPRINT-5.md`, extended in
`docs/sprints/SPRINT-6.md`): resolves a controller method's own call
graph via `packages/parser-java`'s body events, follows same-project
field-typed and bare self-calls one level deep (a project type index
resolves `field.method(...)` to its declaring class), and names each step
via a small, data-driven verb/prefix table (`findBy*` → a lookup,
`exists*`/a null-check → a decision, `save`/`put` → a database operation,
`register`/`create` → a business step, …) combined with a domain noun
derived from the owning type's name. Loops, switch, try/catch, and
lambdas aren't modeled; call resolution beyond one hop falls back to a
described-but-not-inlined step rather than erroring.

`BusinessFlow` is a **real branching graph**, not a flattened chain: a
decision's guard-clause outcome and its normal-flow continuation are two
separate edges out of the _same_ decision node
(`BusinessFlow.edges: BusinessFlowEdge[]`), not two links in one chain.
`describeDecision` also tracks `affirmativeBranch` — which branch answers
"Yes" to the _phrased_ question, since a raw Java condition being true
doesn't always mean "yes" (`customer == null` phrased as "was the
customer found?" has its raw-true branch mean "No"). Getting this
backwards would mislead a reader of the rendered flowchart, so it's
covered by a dedicated integration test against the real fixture.

Depends on the technical semantic models (`packages/parser-java` /
`packages/parser-spring` output shapes) and `packages/graph-schema` (for
the node/edge type vocabulary a `BusinessStep` reuses directly) but must
never depend on React, Electron, or Cytoscape (`docs/ARCHITECTURE.md`).

**Status:** implemented — see `docs/sprints/SPRINT-5.md` / Weekend 5 and
`docs/sprints/SPRINT-6.md` / Weekend 6.
