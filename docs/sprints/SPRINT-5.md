# SPRINT-5: Business Flow Engine (Weekend 5)

## Goal

Selecting an API shows a meaningful business flow — the visible result
defined in `docs/ROADMAP.md`'s ten-weekend plan. This is the sprint where
FlowScope stops describing _what exists_ (an endpoint) and starts
describing _what happens_ (the sequence of business-meaningful steps that
endpoint performs), per `MASTER_PLAN.md` §5, §11–13.

Interactive graph rendering (Cytoscape/ELK, pan/zoom, node selection in a
canvas) is explicitly Sprint 6's work — see `docs/ROADMAP.md`'s priority
order ("5. Build BEG" before "6. Visualize BEG"). Sprint 5 renders the
inferred flow as a simple, ordered step list in the existing center panel;
Sprint 6 replaces that list with the real interactive canvas without
changing the underlying BEG.

## Architecture touched

- `packages/parser-java`: extends the Java Semantic Model with per-method
  **body events** — a flat, ordered, best-effort extraction of method
  calls, object construction, `if` guards, `throw`s, and `return`s from a
  method's body — and per-type **field declarations** (name + declared
  simple type), needed to resolve `someField.someMethod()` calls to the
  field's declared type. Deliberately not a full control-flow model (no
  loops, switch, try/catch, lambdas) — see "Explicitly deferred" below.
- `packages/business-analyzer`: first real implementation. Given a
  `DiscoveredApi` and a parsed project-wide Java index, resolves the
  entry-point controller method's body events, follows same-project method
  calls one level deep (controller → the bean method it calls), and infers
  a human-readable, confidence-scored sequence of business steps using a
  verb/pattern naming heuristic (`MASTER_PLAN.md` §12 — never presented as
  certain).
- `packages/graph-schema`: first real implementation — the versioned
  `flowscope.json`-shaped types/zod schemas for a BEG graph (nodes, edges,
  the extensible node/edge type vocabulary from
  `docs/architecture/graph-model.md`) and a `validateGraph` function.
- `packages/graph-engine`: first real implementation — `buildGraph` turns
  a `BusinessFlow` (business-analyzer's output) into a validated BEG graph
  (linear `sequence`/`error` edges for Sprint 5's guard-clause-shaped
  flows).
- `packages/parser-java` also gains `parseJavaFiles` (project-wide,
  Node-only orchestration, mirroring `packages/scanner`/
  `packages/parser-spring`'s resilience pattern), and
  `packages/parser-spring`'s `discoverApis` is refactored to use it
  instead of its own near-duplicate read+parse loop
  (`docs/CODING_GUIDELINES.md` "no duplicate utilities").
- `packages/ipc`: new `project.inferBusinessFlow` operation.
- `apps/desktop`: selecting a discovered API in the sidebar now triggers
  flow inference; the center canvas renders the resulting steps as an
  ordered list (icon per node type, business name + description,
  technical name, a "Low confidence" badge below a threshold) instead of
  the static "Selected: ..." placeholder text.

## Planned scope

- Body-event extraction covers exactly what the real
  `simple-customer-service` fixture needs, kept intentionally generic
  rather than a hand-modeled grammar (matching ADR-006's own philosophy):
  top-level statements in a method's direct block — local variable
  declarations (calls and `new X(...)` construction), bare statement
  calls, `if` guards (with a best-effort condition description and
  guard-throws/guard-returns flags), `throw`, and `return`. Nested calls
  used only as _arguments_ to another call are not extracted separately
  (avoids noise like emitting a step for `request.email()` inside
  `customerService.register(request.email(), ...)`), except one narrow,
  explicit case: scanning a constructor call's arguments for an
  identifier-generation pattern (`UUID.randomUUID()` and similar) to
  power a "Generate X" step.
- Call resolution: a field's declared simple type name (from the owning
  class's field declarations) resolves `someField.method(...)` to that
  type; if that type is found elsewhere in the same parsed project, its
  method's own body events are inlined in place — but only **one level**
  of inlining (the controller's direct callee), with cycle/depth guards.
  A call that doesn't resolve to a project type (library/framework calls
  like `ResponseEntity.ok(...)`) is not inlined — it's either absorbed
  into the terminal "Return Response" step (for `ResponseEntity.*`
  specifically) or described via the naming heuristic alone.
- Naming heuristic: a small, tested, data-driven table of verb/prefix
  patterns (`findBy*`/`get*` → "Find", `exists*`/`has*`/`is*` → a
  `decision` step, `save`/`put`/a Map/Collection field target → a
  `database-operation` step, `register`/`create`/`add` → a `business-step`,
  `validate`/`check` → a `validation` step, …) combined with a domain
  noun derived from the callee type's simple name (stripping
  `Service`/`Repository`/`Controller`/`Impl` suffixes) or, failing that,
  the API's path segment. Anything matching no pattern still produces a
  step — a humanized version of the method name — but at low confidence,
  never silently dropped and never presented as certain.
- `if` guards whose then-branch's first statement is a `throw` or
  `return` are rendered as a `decision` step immediately followed by its
  outcome (`error` for a throw, a terminal `response`/`error` step for an
  early return) — a linear "check → alternate outcome → continue"
  reading, consistent with guard-clause style code, without requiring an
  actual branching graph UI (Sprint 6's job).
- The BEG produced is a straight-line sequence of `sequence` edges, plus
  `error` edges from a decision step to its guard outcome. `flowscope.json`
  as an on-disk, cached artifact is not implemented — the graph is
  computed fresh per request and crosses IPC as validated JSON; disk
  persistence/caching is deferred (see below).

## Explicitly deferred to later sprints

Interactive graph canvas (Cytoscape/ELK, pan/zoom/layout, node click →
Inspector) — Sprint 6. The Inspector itself — Sprint 7. Loops, switch,
try/catch, lambdas, and anonymous classes in body-event extraction; call
resolution beyond one level of inlining; multi-file/multi-class field
type resolution across generics or interfaces with multiple
implementations; developer/technical detail-level UI switching (the
underlying `projectGraph` function exists and is tested, but nothing in
the renderer calls it yet); `flowscope.json` disk persistence and
incremental/cached re-analysis (`MASTER_PLAN.md` §35's `JavaSourceIndexer`
is still not implemented — every inference re-parses the project fresh,
consistent with `project.discoverApis`'s own behavior since Sprint 4).

## Acceptance criteria

- [x] `parseJavaFile` correctly extracts field declarations (name +
      simple declared type) and per-method body events from real Java
      source, verified against both hand-built snippets and the real
      fixture's `CustomerController`/`CustomerService`. 27 tests in
      `packages/parser-java` (14 hand-built body-event cases, 4 against
      the real fixture, plus the pre-existing 13 from Sprint 4).
- [x] `business-analyzer` produces a specific, correct, non-generic
      business flow for `POST /customers` against the real fixture:
      a decision step for the existing-customer check, an error step for
      the rejection, a step for customer construction, a step for the
      save operation, and a terminal response step — in that order.
      Verified against the real, fully-parsed fixture (not hand-built
      models) in `infer-business-flow.integration.test.ts`: `Register
Customer → Check if Customer Exists by Email → Reject Customer →
Generate Customer → Save Customer → Return Response`, with the
      rejection connected by an `error` edge and the step resuming the
      happy path afterward flagged `conditional`.
- [x] `business-analyzer` produces a distinct, correct flow for
      `GET /customers/{id}` against the real fixture: a lookup step, a
      decision step for the not-found check, an error/response step for
      the 404 branch, and a terminal success response step. Verified:
      `Find Customer by Id → Find Customer → Check if Customer was Found
→ Return Not Found Response → Return Response`.
- [x] `graph-schema`'s `validateGraph` rejects a graph with a duplicate
      node id, an edge referencing a missing node, or an out-of-range
      confidence value. 9 tests in `validate-graph.test.ts`.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` are all
      clean — 29 test files, 192 tests, across the whole workspace.
- [x] Verified by launching the actual built app against the real
      `simple-customer-service` fixture: selecting `POST /customers` and
      `GET /customers/{id}` in the sidebar each rendered their own
      distinct, correct step list in the center canvas — icon, business
      name, description, and technical name per step, with "if the check
      above failed" / "otherwise" labels making the flattened branching
      honest rather than implying a single linear path. Confirmed
      end-to-end against BOTH real API flows exactly matching the
      integration test predictions above. The preload bundle
      (`out/preload/index.js`) was grepped and confirmed free of
      `node:fs`, `java-parser`, and `chevrotain`.

## Status

Complete.
