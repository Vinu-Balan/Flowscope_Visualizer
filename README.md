# FlowScope

FlowScope is a desktop Software Intelligence Platform that turns the
implementation of a software system into an understandable **Business
Execution Graph (BEG)** — what the system actually _does_, in business
terms, before you have to understand its technical architecture.

Phase 1 targets Spring Boot projects: open a project, analyze it, and
explore its APIs as readable business flows (e.g. `POST /customers` →
Register Customer → Validate → Check Existing Customer → Save Customer →
Send Welcome Email → Return Response), with progressive disclosure down to
developer- and technical-level detail, and one click from any step to its
exact source location.

Full product intent lives in [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md).

## Status

**Pre-implementation.** The repository currently contains the monorepo
scaffold, tooling configuration, and architecture documentation only — no
application code yet. See [`docs/epics/EPIC-0.md`](docs/epics/EPIC-0.md)
for what's landed and [`docs/sprints/SPRINT-1.md`](docs/sprints/SPRINT-1.md)
for what's next.

## Documentation

| Doc                                                             | Purpose                                                |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md)                    | Canonical product specification                        |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                  | Enforced repo structure & dependency direction         |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)                            | Phases and the Phase 1 sprint plan                     |
| [`docs/CODING_GUIDELINES.md`](docs/CODING_GUIDELINES.md)        | Rules for writing FlowScope code                       |
| [`docs/architecture/`](docs/architecture/)                      | System, domain model, pipeline, graph schema, security |
| [`docs/adr/`](docs/adr/)                                        | Architecture Decision Records                          |
| [`docs/epics/`](docs/epics/) / [`docs/sprints/`](docs/sprints/) | Phase-level and sprint-level tracking                  |

## Repository layout

```
apps/
  desktop/         Electron + React + TypeScript desktop application
  parser-engine/   Rust static analysis engine
packages/
  core/ shared/ ui/ visualization/ graph-schema/ graph-engine/
  parser-core/ parser-java/ parser-spring/ business-analyzer/
  workspace/ scanner/ ipc/ logging/ config/
docs/            Architecture, ADRs, epics, sprints
scripts/         Repo automation
tests/           Cross-package integration/e2e fixtures
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for what each package is
responsible for and the dependency rules between them.

## Development

Requires Node.js ≥ 20 and pnpm ≥ 9.

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm dev` (desktop app) and `pnpm test:e2e` become meaningful once
`apps/desktop` has real code — see `docs/sprints/SPRINT-1.md`.

## Principles

- **Business-first.** Framework terminology (Controller, Service,
  Repository, Bean, Entity, JPA, Hibernate, Spring, DI) is never the
  primary UI concept — see `MASTER_PLAN.md` §4.
- **Local-first.** Source code never leaves your machine by default. No
  cloud upload, no external AI calls, no telemetry containing source —
  see `MASTER_PLAN.md` §29, §50.
- **Static analysis only.** FlowScope never executes the code it analyzes.
- **Confidence, not certainty.** Inferred business meaning always carries
  a confidence score and is never presented as fact — see
  `MASTER_PLAN.md` §12.

## License

Proprietary — see [`LICENSE`](LICENSE). A commercial licensing model has
not yet been finalized (`MASTER_PLAN.md` §48–49).
