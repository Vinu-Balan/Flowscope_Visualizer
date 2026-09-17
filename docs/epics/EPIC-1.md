# EPIC-1: Phase 1 — Business Architecture Visualization

## Goal

Deliver the full Phase 1 user journey end to end (`MASTER_PLAN.md` §7–8):

```
Launch → Open project → Validate → Analyze → Scan source → Parse Java →
Understand Spring semantics → Infer business operations → Build BEG →
Generate flowscope.json → Discover APIs → Display in sidebar →
Select API → Display business flow → Select node → Inspector →
Open implementation → Jump to source
```

culminating in the defining demo in `docs/ROADMAP.md` ("the core demo").

## Scope (features, per `MASTER_PLAN.md` §8)

Desktop application shell; project opening; project validation; Maven
project detection; Gradle project detection; Java source discovery;
resource discovery; Java parsing; Spring semantic analysis; API discovery
(GET/POST/PUT/PATCH/DELETE); business flow inference; BEG generation;
graph serialization (`flowscope.json`); interactive graph visualization
(zoom/pan/layout); node selection; Inspector; source-code navigation;
search; API filtering; business/developer/technical detail levels; loading/
error/empty states; project re-analysis; basic caching; keyboard shortcuts;
settings; application logging; automated tests; installer/package
generation.

## Explicitly out of scope (deferred to later phases, `MASTER_PLAN.md` §84)

Runtime agent, production monitoring, cloud backend, team collaboration,
auth server, enterprise RBAC, AI assistant, remote project storage,
distributed tracing, Kubernetes monitoring, billing, cloud database,
microservice deployment platform.

## Sub-epics / sprint mapping

Tracked as individual sprints under `docs/sprints/`, sequenced per
`docs/ROADMAP.md`'s ten-weekend plan:

1. Desktop foundation (`SPRINT-1.md`) — complete
2. Project opening (`SPRINT-2.md`) — complete
3. Project scanner (`SPRINT-3.md`) — complete
4. API discovery (`SPRINT-4.md`) — complete
5. Business flow engine (`SPRINT-5.md`) — complete
6. Graph visualization (`SPRINT-6.md`) — complete
   - Real-world extraction fidelity & naming quality hardening
     (`SPRINT-7.md`) — complete; doesn't map onto its own weekend, see
     SPRINT-7.md's Goal section
   - Branch correctness & argument visibility hardening (`SPRINT-8.md`) —
     complete; same as SPRINT-7, doesn't map onto its own weekend
   - If/else branch coverage (`SPRINT-9.md`) — complete; same as SPRINT-7/8
   - JAX-RS/Jersey endpoint discovery (`SPRINT-11.md`) — complete; a
     direct-request feature, not a real-world hardening pass like
     SPRINT-7–9 (no real Jersey project existed to harden against),
     implemented against the JAX-RS spec instead
   - Deeper business logic capture (`SPRINT-12.md`) — complete: call-chain
     inlining raised from 1 to 8 hops, `try`/`catch` modeled as a real
     branch, plus two real data-loss bugs found and fixed (a plain
     reassignment's call, and a call nested inside a `return`'s wrapper).
     Interface→implementation resolution, loops, general lambda bodies,
     and `switch` remain open, see SPRINT-12.md
   - Full-depth debugging capture (`SPRINT-13.md`) — complete: a field
     typed as a service interface now resolves to its real implementing
     class (parser-java parses `interface` declarations at all now,
     previously skipped entirely), diagnostic logger/console calls are
     left out of the flow entirely, and a loop/classic `switch` are each
     modeled as real steps for the first time. General lambda bodies
     (`Optional...orElseThrow`, confirmed real 19x across 12 files) and
     arrow-style `switch` expressions remain open, see SPRINT-13.md
7. Inspector
8. Code navigation
9. Search & UX polish
10. Release preparation (`SPRINT-10.md`) — portable Windows package
    complete, pulled forward ahead of 7–9 on direct request; installer/
    signing/auto-update still not built, see SPRINT-10.md

## Test fixtures needed (`MASTER_PLAN.md` §58)

Dedicated, deterministic sample Spring Boot projects, no real/proprietary
data, exercising REST APIs, service calls, DB operations, validation,
conditional branches, exceptions, external calls, and transactions:
`simple-customer-service` (landed in SPRINT-3 — see its own README under
`tests/fixtures/`), `order-service`, `payment-service`,
`error-handling-service`, `large-project-fixture`. The remaining four are
added as later sprints need what they specifically exercise.

## Acceptance criteria for the epic as a whole

- [x] A real Spring Boot project can be opened and analyzed without errors.
- [x] Discovered APIs appear in the Architecture sidebar.
- [x] Selecting an API renders a business-level flow the user can read
      without Spring knowledge.
- [ ] Selecting a node opens an Inspector with business + technical detail
      and a working "Open Source" jump to the exact file/line in Monaco.
- [ ] Search finds APIs, business nodes, technical methods, classes, and
      source files.
- [ ] Business/developer/technical detail levels are switchable without
      re-running analysis.
- [ ] A packaged Windows installer runs the above end to end (a portable,
      no-install package exists instead — `SPRINT-10.md`, done first on
      direct request; a real installer with signing is still open).

## Status

In progress. SPRINT-1 (desktop foundation), SPRINT-2 (project opening —
real Maven/Gradle validation), SPRINT-3 (project scanner — Java/resource
file discovery, surfaced in the Architecture sidebar), SPRINT-4 (API
discovery — real Java parsing via `packages/parser-java`, Spring MVC
endpoint discovery via `packages/parser-spring`, both surfaced in a
clickable Architecture sidebar list; SPRINT-11 later added independent
JAX-RS/Jersey discovery in the same pass), SPRINT-5 (business flow engine —
`packages/business-analyzer` infers a confidence-scored, branching
business flow per API, `packages/graph-engine`/`packages/graph-schema`
assemble and validate the BEG), SPRINT-6 (graph visualization — the
BEG now renders as a real interactive flowchart, `packages/visualization`
via Cytoscape.js + ELK.js: decision hexagons, Yes/No branch edges,
pan/zoom, click-to-select), SPRINT-7 (a real-world hardening pass —
overloaded handler methods now resolve to their own body instead of
whichever was declared first, a bare self-call to a private helper is
inlined, a `static final String` constant resolves on `return`, and the
node-detail panel's Technical/Flow sections carry real detail instead of
one line), and SPRINT-8 (a second hardening pass — a decision whose
then-branch is a non-exiting side effect now produces two correctly
labeled edges instead of one mislabeled one, and every
call/construct/throw/return step's Technical line shows the real
argument text, e.g. `product.setName(name)`, instead of a `(...)`
placeholder), and SPRINT-9 (a real `if`/`else` — not just a guard clause
— now gives both branches their own steps off the decision, with
whatever follows resuming from whichever branch doesn't return/throw;
also fixed a related bug where a non-call condition followed by a
call-shaped then-branch corrupted the decision's name), SPRINT-10 (a
portable, no-install Windows package — `electron-builder` configured, a
real app icon, `release/FlowScope-0.1.0-portable-win-x64.zip` built and
its `.exe` verified to actually launch and work standalone), and
SPRINT-11 (JAX-RS/Jersey endpoint discovery — a class-level `@Path` plus
a bare `@GET`/`@POST`/etc. marker is now recognized independently of
Spring MVC's `@RestController`/`@GetMapping` style, verified through the
real parser against a spec-accurate resource class and its
`JerseyConfig`/`ResourceConfig` registration), and SPRINT-12 (deeper
business logic capture — call-chain inlining raised from 1 to 8 hops
with a total-step safety valve, `try`/`catch` modeled as a real branch
per catch clause, and two real data-loss bugs fixed: a plain
reassignment's call and a call nested inside a `return`'s wrapper — one
real endpoint went from 2 rendered steps to 10, another to 22), and
SPRINT-13 (deeper still — a field typed as a service interface now
resolves to its real implementation instead of dead-ending, diagnostic
logging is left out of the flow entirely, and a loop/classic `switch`
are each modeled as real steps for the first time — one endpoint went
from 4 rendered steps to 32) are complete and verified. Selecting a node
already surfaces
business + technical detail in the side panel, a partial step toward the
full Inspector acceptance criterion below — the "Open Source" jump to
Monaco (source navigation isn't wired in yet) and search are the
remaining work, next.
