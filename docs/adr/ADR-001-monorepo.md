# ADR-001: pnpm Monorepo with a Fixed `apps/` + `packages/` Layout

## Status

Accepted

## Context

FlowScope spans a desktop shell (Electron + React), a set of tightly
related domain packages (graph schema/engine, parser adapters, business
analyzer, IPC contracts, etc.), and — long-term — a Rust analysis engine.
These pieces evolve together and share types across the IPC boundary, but
must remain strictly layered (`docs/ARCHITECTURE.md`): the UI must never
reach into parsing internals, and the domain model must never depend on
Electron/React/Spring.

## Decision

Use a single pnpm workspace monorepo with a fixed structure:
`apps/{desktop,parser-engine}` for deployable applications, and
`packages/{core,shared,ui,visualization,graph-schema,graph-engine,
parser-core,parser-java,parser-spring,business-analyzer,workspace,scanner,
ipc,logging,config}` for everything else, exactly as enumerated in
`MASTER_PLAN.md` §15–16 and `docs/ARCHITECTURE.md`. Package manager: pnpm
(workspaces via `pnpm-workspace.yaml`).

The Rust engine (`apps/parser-engine`) lives in the same repo as a sibling
app, communicating with the desktop app only through the IPC contract layer
— it is not a pnpm package, but its build output and Cargo workspace are
still governed by this same top-level layout.

## Consequences

- One version of shared types, one lockfile, atomic cross-package changes,
  consistent tooling (TypeScript, ESLint, Vitest) across every TS package.
- Package boundaries are enforced by directory + dependency-direction
  convention now; may be enforced mechanically later (e.g. dependency-cruiser
  or ESLint import-boundary rules) once there's enough code for that to be
  worth adding.
- Renaming or restructuring `apps/`/`packages/` requires a new ADR — see
  `MASTER_PLAN.md` §15.
- The Rust engine's own dependency graph (Cargo workspace) is documented
  separately once `apps/parser-engine` gains real crates; this ADR only
  fixes its location in the repo, not its internal structure.
