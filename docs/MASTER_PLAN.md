# FlowScope — Master Plan

> Canonical product specification for FlowScope. This is a condensed, organized
> record of the founding product brief. It is the source of truth for product
> intent; `ARCHITECTURE.md`, `ROADMAP.md`, and `CODING_GUIDELINES.md` are
> focused extracts of this document for day-to-day implementation reference.
>
> The original brief this was distilled from was truncated mid-sentence at its
> final section ("File Implementation Rule"). Where the source cut off, this
> document says so rather than inventing content — see the note at the bottom.

## 1. What FlowScope is

FlowScope is a **Desktop Software Intelligence Platform** that transforms the
implementation of software systems into understandable **Business Execution
Graphs (BEG)**.

It is explicitly **not**: a Spring Boot architecture viewer, a dependency
graph viewer, a class diagram generator, or a logging tool. Those are
side effects of the underlying analysis, never the product's framing.

The central product asset is the **Business Execution Graph** — everything in
the architecture ultimately exists to create, enrich, visualize, navigate,
analyze, and (in later phases) execute/debug against the BEG.

## 2. Product vision

The question FlowScope answers is **"what is this software actually doing?"**
— not "which classes and frameworks are involved?" A developer should be able
to open an unfamiliar Spring Boot project and understand its business
behavior before understanding its technical architecture.

Instead of `Controller → Service → Repository → Entity → JPA → Hibernate`,
FlowScope shows `Customer Registration → Validate → Check Existing →
Generate ID → Save → Send Welcome Email`. Technical detail remains available,
but only through progressive disclosure.

## 3. Target users

Backend developers, QA engineers, product managers, business analysts, new
team members, software architects, engineering managers. The same graph
serves all of them at different detail levels (see §6).

## 4. Core product principle

**Never expose framework terminology first.** Controller, Service,
Repository, Bean, Component, Entity, DTO, JPA, Hibernate, Spring, Dependency
Injection — these are implementation details, not primary UI concepts.
Business concepts (Register Customer, Validate Payment, Reserve Inventory,
Send Notification) lead; technical detail is reachable, not default.

## 5. The Business Execution Graph (BEG)

The BEG — not `flowscope.json` — is the canonical domain model:

```
Business Execution Graph  (canonical in-memory domain model)
        ↓
   flowscope.json          (serialized representation of the BEG)
```

The BEG must be **framework-independent**. A node represents a meaningful
business action, decision, transformation, external interaction, or system
boundary. Each node carries both business and technical metadata; the UI
decides what to surface. Example:

```json
{
  "id": "step-3",
  "businessName": "Save Customer",
  "businessDescription": "Persists the customer information.",
  "technicalName": "CustomerRepository.save()",
  "type": "business-step",
  "source": { "file": "CustomerRepository.java", "lineStart": 48, "lineEnd": 48 }
}
```

Full schema decisions live in `docs/architecture/graph-model.md`.

## 6. Graph levels (one graph, three projections)

The same BEG projects into three presentation levels; switching levels never
regenerates the graph:

- **Business**: Register Customer → Validate Customer → Save Customer → Return Success
- **Developer**: `POST /customers` → `CustomerRegistration.register()` → `CustomerValidation.validate()` → `CustomerRepository.save()` → Response
- **Technical**: `@RestController` → `register()` → `@Transactional` → Repository → Hibernate → SQL

## 7–8. Phase 1 scope and features

Phase 1 = **Business Architecture Visualization**. It does **not** depend on
runtime logs or a runtime agent. User journey:

```
Launch → Open project → Validate → Analyze → Scan source → Parse Java →
Understand Spring semantics → Infer business operations → Build BEG →
Generate flowscope.json → Discover APIs → Display in sidebar →
Select API → Display business flow → Select node → Inspector →
Open implementation → Jump to source
```

Feature list (desktop shell; project open/validation; Maven & Gradle
detection; Java source/resource discovery; Java parsing; Spring semantic
analysis; API discovery for GET/POST/PUT/PATCH/DELETE; business flow
inference; BEG generation & serialization; interactive graph with zoom/pan/
layout; node selection; Inspector; source navigation; search; API filtering;
business/developer/technical levels; loading/error/empty states;
re-analysis; caching; keyboard shortcuts; settings; logging; automated
tests; installer) is tracked as epics/stories under `docs/epics/EPIC-1.md`.

## 9–10. Technology stack

**Desktop (TypeScript, strict, no `any`)**: Electron, React, Vite, Tailwind
CSS, Radix UI, Framer Motion, react-resizable-panels, Monaco Editor,
Zustand, TanStack Router, TanStack Query, Lucide React. Visualization:
Cytoscape.js + ELK.js. Testing: Vitest (unit/integration), Playwright (e2e).
Package manager: pnpm.

**Backend analysis engine (long-term): Rust.** It may be built up
progressively, but the frontend must never couple directly to Java source
files or parsing internals — only to well-defined IPC/data contracts:

```
Electron → IPC abstraction → Rust analysis engine →
Project scanner → Java parser → Spring semantic analyzer →
Business analyzer → Graph builder → BEG → flowscope.json
```

## 11–13. Java analysis & business inference

Pipeline (parsing isolated from business inference, business inference
isolated from UI):

```
Project Scanner → Project Model → Java AST (JavaParser initially; JDT
possible later for deeper resolution) → Java Semantic Model →
Spring Semantic Model → Business Semantic Model → BEG
```

Business inference uses method/class names, annotations, call graphs,
parameters, return types, string constants, repository operations, HTTP
mappings, exception handling, conditional branches, external calls, DB
operations, and domain vocabulary — e.g. `createUser()` → "Register
Customer", `findByEmail()` → "Find Customer by Email". Inference is
**never presented as certain**: every inferred business name carries a
`confidence` score (e.g. `0.91`), and low-confidence inferences are marked
"Inferred" / "Low confidence" in the UI. Business names must use domain
vocabulary, not a mechanical camelCase-to-words conversion.

## 14. Future multi-framework support

Spring Boot is the **first** supported framework, not the definition of
FlowScope. Future targets: .NET/ASP.NET Core, Node/NestJS/Express, Python
(FastAPI/Django), Go, Quarkus, Micronaut. The BEG must never depend on
Spring terminology so that a future `Framework Adapter → Technical Semantic
Model → Business Semantic Model → BEG` pipeline can plug in new ecosystems
without redesigning the graph.

## 15–19. Repository structure & graph schema

See `ARCHITECTURE.md` for the enforced monorepo layout, and
`docs/architecture/graph-model.md` for the full versioned schema, node types
(`business-step`, `decision`, `validation`, `database-operation`,
`external-service`, `message-publish`, `message-consume`, `transformation`,
`authentication`, `authorization`, `transaction`, `response`, `error`,
`system-boundary`, extensible) and edge types (`sequence`, `conditional`,
`success`, `error`, `loop`, `parallel`, `dependency`, `external-call`,
extensible).

## 20–29. UI design

Visual language inspired by VS Code / IntelliJ / Linear / Raycast / Figma —
premium, minimal, professional, dark-first, information-dense, no flashy
gradients, no gratuitous animation, strong typography, subtle borders,
resizable panels, excellent keyboard support. Reference UI images (if
supplied later) are inspiration for panel layout only — never copied
verbatim, always adapted to FlowScope's business-first philosophy.

Layout: top toolbar → main workspace (left sidebar / architecture canvas /
inspector, all resizable) → bottom status bar. Sidebar has exactly two
top-level tabs: **Architecture** (primary, Phase 1) and **Trace Logs**
(placeholder, reserved for the future runtime debugger — never split into
Controllers/Services/Repositories/Beans/Components tabs).

Selecting an API (e.g. `POST /customers`) opens its business flow
immediately and legibly. Clicking a node opens the Inspector (business
description, implementation, source file/line, parameters, response,
possible errors, dependencies — technical detail collapsed by default).
"Open Source" jumps Monaco to the exact file/line/range. Search spans APIs,
business nodes, technical methods, classes, and source files.

## 30–33. Security, IPC, error handling, logging

- **Local-first**: source code never leaves the machine in Phase 1. No
  upload to cloud services, no source sent to external AI providers, no
  telemetry that transmits source. Any future cloud/AI feature is explicit
  opt-in.
- **Electron hardening**: `contextIsolation` on, `nodeIntegration` off in
  renderer, sandbox where compatible, strict preload bridge, no arbitrary
  Node access from renderer, validated IPC in both directions, sanitized
  paths, path-traversal protection, no trust in project metadata, no
  execution of analyzed code (static analysis only — Java is **never
  executed** to analyze it).
- **IPC**: explicit named operations only (`project.open`, `project.scan`,
  `analysis.start`, `analysis.cancel`, `analysis.status`, `graph.load`,
  `graph.save`, `source.open`, …) — never a generic `execute(command)`
  escape hatch. Every request is validated against a typed contract.
- **Errors**: centralized categories (`ProjectNotFound`,
  `UnsupportedProject`, `InvalidProject`, `ParserError`, `AnalysisError`,
  `GraphBuildError`, `SerializationError`, `IpcError`,
  `ConfigurationError`). Never fail silently; user-facing messages stay
  understandable, deeper diagnostics go to logs.
- **Logging**: centralized, leveled (`debug`/`info`/`warn`/`error`), never
  scattered `console.log` in production code, and never logs source code,
  credentials, tokens, secrets, or personal data.

## 34–36. Performance, caching, storage

Design for 10,000+ Java files: incremental analysis, content-hash-based
caching, parallel processing where safe, lazy graph/source loading,
virtualized lists, background + cancellable analysis, a responsive renderer
at all times. Initial cache/storage is filesystem or SQLite (RocksDB is a
future option; Postgres is a future option). SQLite holds projects, analysis
metadata, graph metadata, cache metadata, and applicable preferences — not
arbitrary UI state.

## 37–46. Future phases (architected for now, not built in Phase 1)

- **Phase 2 — Runtime Trace Debugger**: a runtime agent enriches the
  _same_ static BEG with execution metadata (per-node duration/status/error)
  rather than creating a second graph model. Trace events key off
  `nodeId` and carry `executionId`, `requestId`, timestamps, duration,
  status, error, metadata.
- **Phase 3 — Production Monitoring**: performance, error rates, bottleneck
  detection expressed in business-flow terms, not just endpoint latency.
- **Phase 4 — AI Architecture Assistant**: reasons over the BEG and semantic
  models (not raw source), always cites evidence, never fabricates
  analysis; supports local / private-enterprise / cloud deployment models
  with privacy-preserving defaults and explicit consent for anything
  leaving the machine.
- **Phase 5 — Enterprise Platform**: teams, RBAC, SSO, audit logs,
  centralized architecture repository, private AI, compliance tooling.

Also architected-for-later: plugin architecture for framework adapters
(with explicit plugin permissions), team collaboration features (graph
comments/annotations/snapshots/diff, PR architecture visualization), BEG
diffing across versions, business-flow-driven test generation, and
generated documentation traceable back to graph nodes/source.

## 47–52. Legal, compliance, licensing, privacy

The user owns their source code; FlowScope never claims ownership and never
transmits it externally without explicit consent. Telemetry (if any) is
opt-in and never includes source by default. Third-party dependencies are
tracked with an SBOM where practical, and licenses are respected. No
compliance claims (SOC 2, ISO 27001, GDPR, HIPAA, etc.) are made until
actually validated by legal/security review. Commercial licensing
(Community/Professional/Enterprise or equivalent tiers) is deliberately
**not** implemented as artificial Phase 1 restrictions — a licensing
abstraction is left for later so it doesn't get baked into core business
logic. See `docs/adr/` for the ADR trail as these decisions are made.

## 53. Roadmap

See `ROADMAP.md` for the phase breakdown and the 10-weekend / 10-priority
incremental plan.

## 54–56. Development philosophy & documentation

Build like a JetBrains-quality product: modular, SOLID, typed contracts,
centralized logging/errors, tested, documented via ADRs, independently
testable modules, backward-compatible schema evolution, designed for future
runtime tracing from day one. See `CODING_GUIDELINES.md` for the concrete
rules and `ARCHITECTURE.md` for the enforced dependency direction and
required `docs/` tree.

## 57–58. Testing strategy

Unit tests (business analyzer, graph builder, schema validation, scanner,
parser adapters, Spring analyzer, utilities), integration tests (scanning,
Java analysis, graph generation, IPC), UI tests (selection, Inspector,
search, panel resizing, navigation), and e2e tests (open → analyze → view
API → view graph → select node → open source) via Vitest and Playwright.
Dedicated, deterministic sample Spring Boot fixtures (no real/proprietary
data) exercise REST APIs, service calls, DB ops, validation, branches,
exceptions, external calls, and transactions — see `docs/epics/EPIC-1.md`
for the fixture list once Phase 1 implementation begins.

## 59–68. Accessibility, i18n, states, UX flow, visual language, keyboard

Full keyboard navigation, visible focus, screen-reader labels, semantic
controls, sufficient contrast, reduced-motion support. English-only content
is fine for Phase 1, but user-visible strings must not be hard-scattered
through components (localization-ready architecture). Every major operation
has Idle/Loading/Success/Empty/Error/Cancelled states with real copy — never
an unexplained blank screen. Shortcuts (Open, Analyze, Search, Fit, level
switches, etc.) route through one extensible command system, not scattered
listeners.

## 69–75. Analysis pipeline, validation, resilience, source mapping

```
ProjectDiscoveryService → ProjectScanner → JavaSourceIndexer → JavaParser →
SpringSemanticAnalyzer → BusinessAnalyzer → GraphBuilder → GraphValidator →
GraphSerializer
```

Each stage has one responsibility. Before a BEG reaches the UI it is
validated (unique node IDs, valid edges/targets, valid API/source
references, valid schema version, required fields, valid node types, valid
confidence values) and rejected with useful diagnostics if invalid. A single
malformed Java file must not take down the whole analysis — partial results
with a clear warning are the expected behavior. Every technical node
maintains file/lineStart/lineEnd/method/class/package provenance so the
graph and source stay synchronized.

## 76–79. Configuration, build, release, git

Centralized configuration, no hard-coded paths/ports/secrets. Electron
Builder for packaging (Windows first; macOS/Linux architected for later).
Release gate: typecheck, lint, unit+integration+e2e tests, production build,
installer, no known critical security issues, no unhandled startup errors,
no broken IPC, no console noise, docs updated, third-party notices
generated, version bumped. Commits are meaningful (`feat:`, `fix:`,
`docs:`, `test:`, `chore:` — never "update"/"fix stuff").

## 80–84. Development methodology

Build incrementally; every sprint ends with something visible integrated
into the running app — never several iterations of invisible infrastructure.
The defining Phase 1 demo (open a real Spring Boot project → Analyze →
`POST /customers` appears → click it → business flow renders → click "Save
Customer" → Inspector shows `CustomerRepository.save()` at
`CustomerRepository.java:48` → Open Source → Monaco jumps to it) is the
north star for sequencing all other work. See `ROADMAP.md` for the sprint
plan and explicit "what not to build yet" list (runtime agent, production
monitoring, cloud backend, team collab, enterprise RBAC, AI assistant,
remote storage, distributed tracing, k8s monitoring, billing).

## 85–86. Long-term architecture & implementation rules

```
                       FlowScope
                           │
                Business Execution Graph
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
  Architecture         Runtime            AI
  Visualization        Debugger        Assistant
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                 Production Intelligence
```

Implementation rules for whoever (human or AI) writes FlowScope code are
enforced verbatim in `CODING_GUIDELINES.md` §"Implementation rules" —
no skipped architectural decisions, no pseudo-code where production code is
requested, no files absent from the project tree, no unresolved imports or
undeclared dependencies, strict TypeScript and Rust, no `any`, no unsafe
Rust without justification, typed public APIs, tests where practical, no
duplicate utilities, no business logic in React components, no parsing
logic in Electron, no UI coupling to JavaParser, no BEG coupling to Spring,
never bypass the BEG, no temporary/throwaway architecture.

---

### Note on source fidelity

The original product brief this file distills ran to 87 numbered sections
and was cut off mid-sentence inside §87 ("File Implementation Rule"), after
the words _"Whenever you create or modify a file: Provide the comp"_. That
section's intent is already covered by §86's implementation rules (provide
complete, production-quality file contents — never partial snippets or
pseudo-code for requested production work). If the missing tail of §87
contained additional rules beyond that, they were not available when this
document was written and should be reconciled here if/when recovered.
