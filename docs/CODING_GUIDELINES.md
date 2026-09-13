# FlowScope — Coding Guidelines

## Language rules

- TypeScript is strict everywhere (`tsconfig.base.json`). Never use `any`,
  implicit `any`, or unsafe type casts unless truly unavoidable — and if so,
  document why at the cast site.
- Rust is strict. Avoid `unsafe` unless justified in a comment explaining
  why it's necessary and why it's sound.
- Every public API (TS or Rust) has explicit, precise types — no leaking
  `unknown`/`any` across a package boundary.

## Structure rules

- Do not put business logic inside React components — it belongs in
  `packages/business-analyzer`, `packages/graph-engine`, or an application
  service, not a component body.
- Do not put parsing logic inside Electron (main or renderer) — it belongs
  in `apps/parser-engine` / `packages/parser-*`.
- The UI must never depend directly on JavaParser, Java source files, or
  Rust internals — only on `packages/ipc` typed contracts.
- The BEG (`packages/graph-engine`, `packages/graph-schema`) must never
  depend on Spring, Electron, or React — see `docs/ARCHITECTURE.md`.
- Never bypass the BEG: analysis results reach the UI through the graph
  model, not ad hoc side channels.
- No duplicate utilities — check `packages/core` and `packages/shared`
  before writing a new helper.
- No circular package dependencies.
- Keep modules independently testable; keep components and services small
  and single-purpose (no giant components, no giant services).

## What "done" means for a file

- No pseudo-code or placeholders where production code was requested.
- No file is created that isn't represented in the intended project tree
  (see `docs/ARCHITECTURE.md`).
- Every local import resolves to a file that exists.
- Every package dependency used is actually declared in that package's
  manifest.
- Configuration aligns with the versions actually installed.
- Tests exist where practical, especially for: business analyzer, graph
  builder, graph schema validation, project scanner, parser adapters,
  Spring analyzer, and shared utilities.

## Errors & logging

- Route errors through the centralized categories: `ProjectNotFound`,
  `UnsupportedProject`, `InvalidProject`, `ParserError`, `AnalysisError`,
  `GraphBuildError`, `SerializationError`, `IpcError`, `ConfigurationError`
  (`packages/core/errors`). Never swallow an error silently.
- User-facing error text must be understandable without a stack trace;
  technical detail goes to logs.
- Use `packages/logging` for all logging — no scattered `console.log` in
  production code paths. Never log source code contents, credentials,
  tokens, secrets, or personal data.

## IPC

- Every cross-boundary operation is an explicit named entry in
  `packages/ipc` (e.g. `project.open`, `analysis.start`) with validated
  input and output types. Never expose a generic `execute(command)`-style
  escape hatch from the renderer.

## Security defaults (Electron)

`contextIsolation: true`, `nodeIntegration: false` in the renderer, sandbox
where compatible, a minimal strict preload bridge, sanitized/validated
paths (no path traversal), no trust placed in project metadata from disk,
and analyzed Java code is **never executed** — analysis is static only.

## Git

- Commit messages are meaningful and describe intent:
  `feat: implement desktop application shell`,
  `feat: discover Spring APIs`, `test: add project analysis fixtures`,
  `docs: document graph architecture`. Never `update`, `fix stuff`, `wip`,
  `test` alone.
- Every architectural decision that changes the structure in
  `docs/ARCHITECTURE.md` gets an ADR in `docs/adr/` before (or as part of)
  the change.

## Documentation upkeep

When an architectural decision changes, update the relevant doc in the same
change: `docs/ARCHITECTURE.md`, `docs/architecture/*.md`, or a new ADR.
Docs describing a structure that no longer matches the code are worse than
no docs — keep them current.
