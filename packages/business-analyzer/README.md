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
switch, and general lambda bodies aren't modeled; call resolution beyond
`MAX_INLINE_DEPTH` (8, raised from 1 in SPRINT-12 — real endpoints
routinely chain 3+ hops deep) or past `MAX_TOTAL_STEPS` (150, a safety
valve for a call graph that's wide rather than deep) falls back to a
described-but-not-inlined step rather than erroring; `ctx.visited`
(keyed by type/method/line) prevents infinite recursion on a real call
cycle regardless of either bound (`docs/sprints/SPRINT-12.md`).

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
covered by a dedicated integration test against the real fixture. This
covers more than an exiting guard clause: an `if` whose then-branch is a
non-exiting side effect (no `else`, no throw/return — just falls through)
also produces two real edges — the then-branch's own steps (bounded by
`JavaBodyEvent.thenEventCount`) hang off a `'conditional'`-type edge, and
whatever follows the `if` hangs off the decision's other edge, matching
the guard-clause case's approach rather than being silently absorbed into
one mislabeled edge (`docs/sprints/SPRINT-8.md`). A real `else` branch
(not just a guard clause) gets the same treatment — both branches get
their own steps off the decision, and whatever follows the whole
`if`/`else` resumes from whichever branch's last event isn't a
`throw`/`return` (the single-cursor model can't represent two branches
merging back together, so when both happen to fall through the `else`
branch's tail wins, consistently); when both branches *do* end in
`throw`/`return`, nothing resumes, correctly representing an exhaustive
if/else (`docs/sprints/SPRINT-9.md`, scoped by surveying real usage: `if`/`else`
was by far the dominant conditional construct across both of the user's
projects).

A real `try`/`catch` gets the same branching treatment, generalized from
2 branches to N (`handleTry`, mirroring `handleIf`): the try-block and
every catch clause each get their own steps, hanging off the point
before the `try` via an `'error'`-type edge labeled with the exception
type (`describeCatch`) — there's no natural "decision" step the way an
`if`'s condition provides one, so a synthetic step is always added for
entering a catch clause, keeping even a trivial handler visible. The
same "whichever branch doesn't end the method is where trailing code
resumes from" merge-point rule from `if`/`else` applies here too
(`docs/sprints/SPRINT-12.md`, scoped after finding `try`/`catch` used
systemically as real business branching — not just error handling — in
the user's richest real project, e.g. an alternate-lookup-strategy catch
clause, not an error at all).

A `return` whose expression wraps a nested call as its first argument
(`return ResponseEntity.ok(bookingService.createBooking(request));`,
arguably the single most common real Spring MVC controller shape) now
resolves and inlines that nested call first, via
`JavaBodyEvent.returnsNestedCall*`, before the outer wrapper step —
previously only the wrapper (`ResponseEntity.ok`) was ever visible, the
actual business call invisible (`docs/sprints/SPRINT-12.md`; this single
fix turned one real endpoint's rendered flow from 2 steps into 10).

Every step's `technicalName` shows the real argument text the call
actually passes (e.g. `product.setName(name)`, not
`product.setName(...)`), threaded through from `JavaBodyEvent.argumentsText`
/ `returnsCallArgumentsText` — so the Inspector's Technical panel lets a
developer see exactly which variable or literal is in play at a step
without opening the source file (SPRINT-8.md).

Depends on the technical semantic models (`packages/parser-java` /
`packages/parser-spring` output shapes) and `packages/graph-schema` (for
the node/edge type vocabulary a `BusinessStep` reuses directly) but must
never depend on React, Electron, or Cytoscape (`docs/ARCHITECTURE.md`).

**Status:** implemented — see `docs/sprints/SPRINT-5.md` / Weekend 5,
`docs/sprints/SPRINT-6.md` / Weekend 6, `docs/sprints/SPRINT-7.md`,
`docs/sprints/SPRINT-8.md`, `docs/sprints/SPRINT-9.md`, and
`docs/sprints/SPRINT-12.md`.
