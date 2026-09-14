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
3. Project scanner
4. API discovery
5. Business flow engine
6. Graph visualization
7. Inspector
8. Code navigation
9. Search & UX polish
10. Release preparation

## Test fixtures needed (`MASTER_PLAN.md` §58)

Dedicated, deterministic sample Spring Boot projects, no real/proprietary
data, exercising REST APIs, service calls, DB operations, validation,
conditional branches, exceptions, external calls, and transactions:
`simple-customer-service`, `order-service`, `payment-service`,
`error-handling-service`, `large-project-fixture`. To be created under
`tests/fixtures/` when the scanner/parser work begins (SPRINT-3 onward).

## Acceptance criteria for the epic as a whole

- [ ] A real Spring Boot project can be opened and analyzed without errors.
- [ ] Discovered APIs appear in the Architecture sidebar.
- [ ] Selecting an API renders a business-level flow the user can read
      without Spring knowledge.
- [ ] Selecting a node opens an Inspector with business + technical detail
      and a working "Open Source" jump to the exact file/line in Monaco.
- [ ] Search finds APIs, business nodes, technical methods, classes, and
      source files.
- [ ] Business/developer/technical detail levels are switchable without
      re-running analysis.
- [ ] A packaged Windows installer runs the above end to end.

## Status

In progress. SPRINT-1 (desktop foundation) and SPRINT-2 (project opening —
real Maven/Gradle validation, replacing the unvalidated folder pick from
Sprint 1) are complete and verified. Project scanning/analysis and
everything it unlocks (APIs, business flows, Inspector, source navigation)
has not started; that's SPRINT-3 onward.
