# FlowScope — Roadmap

## Phases

1. **Business Architecture Visualization** (current focus) — project
   analysis, API discovery, business flow inference, BEG, interactive graph,
   Inspector, source navigation, search, `flowscope.json`.
2. **Runtime Trace Debugger** — runtime agent, execution IDs, trace events,
   timing, live graph animation, request replay where appropriate, execution
   history. Enriches the existing BEG; does not replace it.
3. **Production Monitoring** — metrics, performance, errors, business-flow
   monitoring, historical analysis, alerts, dashboards, expressed in
   business terms rather than raw endpoint latency.
4. **AI Architecture Assistant** — natural-language architecture queries,
   business-flow explanation, root-cause analysis, recommendations, test
   generation, documentation generation, architecture comparison. Reasons
   over the BEG, always cites evidence, never fabricates.
5. **Enterprise Platform** — teams, RBAC, SSO, audit logs, centralized
   architecture repository, private AI, enterprise deployment, compliance
   tooling, architecture governance.

Explicitly **not** built during Phase 1: runtime agent, production
monitoring, cloud backend, team collaboration, auth server, enterprise RBAC,
AI assistant, remote project storage, distributed tracing, Kubernetes
monitoring, complex billing, cloud database, microservice deployment
platform. Phase 1 architects _for_ these without implementing them.

## Ten-weekend Phase 1 plan

| Weekend | Deliverable          | Visible result                                       |
| ------- | -------------------- | ---------------------------------------------------- |
| 1       | Desktop foundation   | FlowScope launches with a professional desktop shell |
| 2       | Project opening      | User can select a project                            |
| 3       | Project scanner      | Java files and project structure discovered          |
| 4       | API discovery        | APIs appear in the Architecture sidebar              |
| 5       | Business flow engine | Selecting an API shows a meaningful business flow    |
| 6       | Graph visualization  | Interactive BEG canvas                               |
| 7       | Inspector            | Business and technical metadata visible              |
| 8       | Code navigation      | Graph node → Java source                             |
| 9       | Search & UX polish   | Professional developer experience                    |
| 10      | Release preparation  | Installable Phase 1 MVP                              |

## Priority order (do not skip ahead)

1. Application shell
2. Open project
3. Scan project
4. Discover APIs
5. Build BEG
6. Visualize BEG
7. Inspect BEG
8. Navigate to source
9. Search
10. Package/release

Do not spend excessive time on advanced features before this core flow
works end to end.

## The defining Phase 1 demo

```
Launch FlowScope → Open a real Spring Boot project → Click Analyze →
FlowScope discovers POST /customers → Click it → FlowScope displays:
  Register Customer → Validate Input → Check Existing Customer →
  Generate Customer ID → Save Customer → Send Welcome Email → Return Response
→ Click "Save Customer" → Inspector shows CustomerRepository.save() at
  CustomerRepository.java:48 → Click Open Source → Monaco opens the
  Java implementation at that line.
```

Every sprint should move measurably toward this demo working on a real
project.

## Current status

**Weekends 1–6 (Desktop foundation, Project opening, Project scanner, API
discovery, Business flow engine, Graph visualization) complete, three
real-world hardening passes (Sprint 7, Sprint 8, Sprint 9), and Weekend
10 (Release preparation) pulled forward on direct request** — see
`docs/sprints/SPRINT-1.md` through `SPRINT-10.md`. Weekends 7–9
(Inspector's remaining work, source navigation, search) are still ahead;
Weekend 10 shipped early because the user asked for a runnable package
specifically. FlowScope launches as a
real Electron desktop app: Welcome/Workspace routes, resizable three-pane
workspace shell, command palette, settings dialog, theme system, and a
working IPC contract (ping, project-open dialog, project validation,
project scanning, API discovery, business flow inference, settings
get/update). Opening a project runs real Maven/Gradle validation
(`packages/workspace`) with a Recent Projects list; clicking Analyze (or
Ctrl/Cmd+Shift+A) walks the project's file tree (`packages/scanner`),
parses its Java files (`packages/parser-java`, ADR-006), and discovers
Spring MVC REST endpoints (`packages/parser-spring`) — shown in the
Architecture sidebar as a clickable, method-badged API list. Selecting an
API infers its real business flow (`packages/business-analyzer` +
`packages/graph-engine` + `packages/graph-schema`) — a confidence-scored,
_branching_ graph, not a flattened chain: a decision node has two distinct
outgoing edges (its guard-clause outcome and whatever resumes normal
flow), each inferred from the method's actual call graph one level of
same-project calls deep, never presented as certain — and renders it as a
real interactive flowchart (`packages/visualization`, Cytoscape.js +
ELK.js): decision hexagons (SPRINT-7.md — a diamond's usable text area was
too cramped for real decision text), Yes/No branch labels, colored edges,
pan/zoom, click a node for its full detail — description, confidence, a
labeled Technical table (call, class, method, source location), and a
Flow section showing what leads into and out of that step — in the side
panel. Business-flow extraction correctly resolves overloaded handler
methods (two `@GetMapping`/`@PostMapping` methods sharing a name each
analyze their own body, not whichever was declared first), inlines a bare
self-call to a private same-class helper, and resolves a
`private static final String` constant's literal value on `return`
(SPRINT-7.md, found and fixed against the user's own real Spring Boot
projects, not just the fixture). A decision whose then-branch is a
non-exiting side effect (no `else`, no throw/return — just falls through)
produces two correctly labeled edges instead of one mislabeled one, and
every call/construct/throw/return step's Technical detail shows the real
argument text (e.g. `product.setName(name)`) instead of a `(...)`
placeholder, so a developer can see exactly which variable is in play at
a step without opening the source (SPRINT-8.md). A real `if`/`else` (not
just a guard clause) is modeled too — each branch gets its own steps off
the decision, and whatever code follows the `if`/`else` resumes from
whichever branch doesn't return/throw (SPRINT-9.md, scoped by surveying
real usage across both of the user's projects: `if`/`else` was the
dominant conditional construct by a wide margin; `switch` never appears
in either). All backed by tested
`packages/core`,
`packages/logging`, `packages/config`, `packages/ipc`,
`packages/workspace`, `packages/scanner`, `packages/parser-java`,
`packages/parser-spring`, `packages/graph-schema`, `packages/graph-engine`,
`packages/business-analyzer`, `packages/visualization`, and `packages/ui`,
plus the first real test fixture (`tests/fixtures/simple-customer-service`).
The Inspector's full business/developer/technical level switching and
source navigation ("Open Source" → Monaco), plus search, are still
Weekend 7/8/9's remaining work, next. A portable, no-install Windows
build now exists too (`apps/desktop`'s `pnpm run dist:win`,
`docs/sprints/SPRINT-10.md`) — Weekend 10's deliverable, done ahead of
7–9 because the user asked for a runnable `.exe` directly; still unsigned
and without auto-update, both explicitly out of Phase 1 scope.
