# ADR-003: Electron + React Desktop Shell with a Hardened Renderer

## Status

Accepted

## Context

FlowScope is a desktop application that must feel like a premium IDE-
adjacent tool (VS Code / IntelliJ / Linear-inspired, `MASTER_PLAN.md` §20),
support rich interactive graph visualization and a Monaco-based source
viewer, ship cross-platform eventually (Windows first, §77), and — critically
— treat the analyzed project's source code as sensitive and never let the
renderer touch it directly (§30, §50).

## Decision

Use Electron for the desktop shell, React + TypeScript + Vite for the
renderer UI, and enforce a hardened renderer from day one:
`contextIsolation: true`, `nodeIntegration: false`, sandbox where
compatible, and a minimal explicit preload bridge. All access to the
filesystem, the project, and the analysis engine happens through the typed
IPC contract in `packages/ipc` (see `docs/adr/ADR-004-ipc-boundary.md`) —
never through direct Node APIs exposed to the renderer.

State/data: Zustand for local UI state, TanStack Query for IPC-backed async
data, TanStack Router for navigation. Visualization: Cytoscape.js + ELK.js
behind `packages/visualization`. Source viewing: Monaco Editor. Styling:
Tailwind CSS + Radix UI primitives. Motion: Framer Motion, used sparingly
(`MASTER_PLAN.md` §66).

## Consequences

- The renderer process can be treated as running against a partially
  untrusted project (malicious project files, adversarial paths) without
  risking the host machine, because it never gets raw filesystem/process
  access.
- Every new capability the UI needs requires a deliberate, named,
  validated IPC operation — slightly more ceremony than a direct Node call,
  in exchange for a closed, auditable capability surface
  (`docs/architecture/security-architecture.md`).
- Packaging uses Electron Builder (`MASTER_PLAN.md` §77); production builds
  must not carry development-only debugging behavior (§78 release gate).
