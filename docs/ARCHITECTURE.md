# FlowScope — Architecture

See `MASTER_PLAN.md` for product intent. This document is the enforced
technical structure.

## Dependency direction

```
UI  →  Application Services  →  Domain  →  Infrastructure
```

Hard boundaries (violating these is an architecture bug, not a style
preference):

- The **UI** (`apps/desktop`, `packages/ui`, `packages/visualization`) must
  never directly depend on JavaParser, filesystem internals, the Spring
  parsing implementation, or Rust internals. It talks to the analysis engine
  only through `packages/ipc` typed contracts.
- The **business analyzer** (`packages/business-analyzer`) must never depend
  on React, Electron, or Cytoscape.
- The **graph schema** (`packages/graph-schema`) must never depend on
  Spring, Electron, or React. It is framework-independent by construction —
  this is what makes multi-framework support (§14 of the master plan)
  possible later without redesigning the graph.

## Repository layout

```
flowscope/
├── apps/
│   ├── desktop/          Electron + React + TS desktop application (Phase 1 UI)
│   └── parser-engine/    Rust analysis engine (scanner, Java parser, Spring
│                         semantic analyzer, business analyzer, graph builder)
│
├── packages/
│   ├── core/              Cross-cutting infra: errors, events, types, Result,
│   │                      identifiers, validation, utilities
│   ├── shared/             Shared contracts/DTOs used across the IPC boundary
│   ├── ui/                 Shared React component library (design system)
│   ├── visualization/      Cytoscape.js/ELK.js graph rendering layer
│   ├── graph-schema/       Versioned flowscope.json schema, types, validators
│   ├── graph-engine/       In-memory BEG domain model: build/query/validate/
│   │                      project (business/developer/technical levels)
│   ├── parser-core/        Framework-agnostic parsing/AST abstractions
│   ├── parser-java/        Java parsing adapter (java-parser-based, ADR-006)
│   ├── parser-spring/      Spring semantic analyzer
│   ├── business-analyzer/  Business Semantic Model inference + confidence
│   ├── workspace/          Project/workspace identity and lifecycle
│   ├── scanner/            Project discovery, source scanning, incremental hashing
│   ├── ipc/                Typed IPC contract definitions + validation
│   ├── logging/            Centralized structured logging
│   └── config/             Centralized configuration + settings persistence
│
├── docs/
│   ├── architecture/       system-architecture, domain-model, analysis-pipeline,
│   │                      graph-model, security-architecture
│   ├── adr/                Architecture Decision Records
│   ├── epics/               Phase-level epics
│   └── sprints/             Per-sprint plans and outcomes
│
├── scripts/
├── tests/
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── LICENSE
```

Do not rename these directories casually. A restructuring requires an ADR
(`docs/adr/`) before the change lands, per `MASTER_PLAN.md` §15.

## Analysis pipeline (conceptual, spans `apps/parser-engine` + relevant packages)

```
ProjectDiscoveryService → ProjectScanner → JavaSourceIndexer → JavaParser →
SpringSemanticAnalyzer → BusinessAnalyzer → GraphBuilder → GraphValidator →
GraphSerializer
```

Each stage is one responsibility, one package (or one clearly-scoped module
within `apps/parser-engine`). See `docs/architecture/analysis-pipeline.md`
for detail as it's implemented.

## IPC boundary

`apps/desktop`'s renderer never gets arbitrary Node/Rust access. All
cross-boundary calls are explicit, named, typed operations defined in
`packages/ipc` (e.g. `project.open`, `project.scan`, `analysis.start`,
`analysis.cancel`, `analysis.status`, `graph.load`, `graph.save`,
`source.open`) and validated on both sides. See
`docs/architecture/security-architecture.md` and `docs/adr/ADR-004-ipc-boundary.md`.

## Status

`apps/desktop`, `packages/core`, `packages/logging`, `packages/config`,
`packages/ipc`, `packages/workspace`, `packages/scanner`,
`packages/parser-java`, `packages/parser-spring`, and `packages/ui` are
implemented (SPRINT-1 through SPRINT-4 — see `docs/sprints/`).
`apps/parser-engine` and the remaining `packages/*` (`shared`,
`visualization`, `graph-schema`, `graph-engine`, `parser-core`,
`business-analyzer`) are still scaffolding only, pending SPRINT-5 onward.

Three structural refinements worth noting, all the same pattern for the
same reason — keep `node:fs` out of anything the sandboxed preload script
might import — so any future package with both a pure schema/type surface
and a Node-only implementation should follow it too:

- `packages/config` publishes `@flowscope/config` (the full barrel,
  main-process only) and `@flowscope/config/settings` (the zod schema,
  Node-free). See the comment atop `packages/config/src/settings.ts` and
  the "found during implementation" note in `docs/sprints/SPRINT-1.md`.
- `packages/workspace` publishes `@flowscope/workspace` (the full barrel,
  including the Node-only `validateProject`) and
  `@flowscope/workspace/project` (the zod schema for `ValidatedProject`,
  Node-free). See the comment atop `packages/workspace/src/project.ts`.
- `packages/scanner` publishes `@flowscope/scanner` (the full barrel,
  including the Node-only `scanProject`) and
  `@flowscope/scanner/scan-result` (the zod schema for
  `ProjectScanResult`, Node-free). See the comment atop
  `packages/scanner/src/scan-result.ts`.
- `packages/parser-spring` publishes `@flowscope/parser-spring` (the full
  barrel, including the Node-only `discoverApis`) and
  `@flowscope/parser-spring/api` (the zod schema for `DiscoveredApi`,
  Node-free). `packages/parser-java` has no such split — nothing in it
  ever crosses the IPC boundary, only the final `DiscoveredApi` shape
  does. See `docs/adr/ADR-006-java-parsing-without-a-jvm.md`.
