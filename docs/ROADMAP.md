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

**Weekends 1–4 (Desktop foundation, Project opening, Project scanner, API
discovery) complete** — see `docs/sprints/SPRINT-1.md` through
`SPRINT-4.md`. FlowScope launches as a real Electron desktop app:
Welcome/Workspace routes, resizable three-pane workspace shell, command
palette, settings dialog, theme system, and a working IPC contract (ping,
project-open dialog, project validation, project scanning, API discovery,
settings get/update). Opening a project runs real Maven/Gradle validation
(`packages/workspace`) with a Recent Projects list; clicking Analyze (or
Ctrl/Cmd+Shift+A) walks the project's file tree (`packages/scanner`), then
parses its Java files (`packages/parser-java`, ADR-006) and discovers
Spring MVC REST endpoints (`packages/parser-spring`) — both now shown in
the Architecture sidebar, with a real Java/resource file count and a
clickable, method-badged list of discovered APIs. All backed by tested
`packages/core`, `packages/logging`, `packages/config`, `packages/ipc`,
`packages/workspace`, `packages/scanner`, `packages/parser-java`,
`packages/parser-spring`, and `packages/ui`, plus the first real test
fixture (`tests/fixtures/simple-customer-service`).
Business flow inference — turning a selected API into an actual flow
diagram, rather than just acknowledging the selection — begins at Weekend
5 (`docs/sprints/SPRINT-5.md`, not yet written).
