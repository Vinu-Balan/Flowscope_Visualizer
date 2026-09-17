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
7. Inspector
8. Code navigation
9. Search & UX polish
10. Release preparation

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
- [ ] A packaged Windows installer runs the above end to end.

## Status

In progress. SPRINT-1 (desktop foundation), SPRINT-2 (project opening —
real Maven/Gradle validation), SPRINT-3 (project scanner — Java/resource
file discovery, surfaced in the Architecture sidebar), SPRINT-4 (API
discovery — real Java parsing via `packages/parser-java`, Spring MVC
endpoint discovery via `packages/parser-spring`, both surfaced in a
clickable Architecture sidebar list), SPRINT-5 (business flow engine —
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
placeholder) are complete and verified. Selecting a node already surfaces
business + technical detail in the side panel, a partial step toward the
full Inspector acceptance criterion below — the "Open Source" jump to
Monaco (source navigation isn't wired in yet) is the remaining work,
next.
