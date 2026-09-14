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
`docs/sprints/SPRINT-6.md` and `docs/sprints/SPRINT-7.md`): resolves a
controller method's own call graph via `packages/parser-java`'s body
events, follows same-project field-typed and bare self-calls one level
deep (a project type index resolves `field.method(...)` to its declaring
class), and names each step via a small, data-driven verb/prefix table
(`findBy*` → a lookup, `exists*`/a null-check → a decision, `save`/`put`
→ a database operation, `register`/`create` → a business step, …)
combined with a domain noun derived from the owning type's name. Loops,
switch, try/catch, and lambdas aren't modeled; call resolution beyond one
hop falls back to a described-but-not-inlined step rather than erroring.

Both the API's entry method and any call resolved for inlining are picked
from *every* same-named candidate on the target type, not just the first
one declared — `selectOverload` prefers the candidate whose arity
(`JavaMethod.parameterCount`) matches the call's own argument count, and
the entry point additionally matches the discovered API's declaration
`line` (SPRINT-7.md; a name-only match silently analyzed the wrong
overload's body whenever two Spring MVC handlers shared a name, e.g. a
`GET`-mapped form-shower and a `POST`-mapped form-submitter both called
`addProduct`). A `return` of a bare identifier that names a same-class
`private static final String` constant resolves to that constant's
literal value (`JavaField.stringConstantValue`) exactly like a literal
`return "...";` would, instead of falling back to a generic response
description.

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

**Status:** implemented — see `docs/sprints/SPRINT-5.md` / Weekend 5,
`docs/sprints/SPRINT-6.md` / Weekend 6, and `docs/sprints/SPRINT-7.md`.
