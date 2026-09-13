# ADR-004: Closed, Typed, Named IPC Operations Only

## Status

Accepted

## Context

Given the hardened-renderer decision (`docs/adr/ADR-003-electron-architecture.md`),
every capability the renderer needs — opening a project, starting analysis,
loading a graph, opening a source file — must cross the Electron IPC
boundary. A generic `execute(command)`-style bridge would reintroduce
arbitrary code/filesystem execution risk from the renderer and defeat the
purpose of context isolation, and is explicitly disallowed by
`MASTER_PLAN.md` §31.

## Decision

`packages/ipc` defines a closed, versioned set of named operations, each
with an explicit input type and output type, validated on both sides
(main and renderer). Initial operation set (extend deliberately, never
open-endedly):

- `project.open`
- `project.scan`
- `analysis.start`
- `analysis.cancel`
- `analysis.status`
- `graph.load`
- `graph.save`
- `source.open`

No operation accepts an arbitrary shell command, file path outside a
validated project root, or arbitrary code to execute. New operations are
added to this list deliberately, with the same validation discipline —
never as a generic passthrough.

## Consequences

- Every renderer→main capability is enumerable, auditable, and testable in
  isolation.
- Adding a feature that needs a new host capability means adding a new
  named, typed IPC operation — not widening an existing one's contract to
  "just take a string command."
- `packages/ipc` becomes the single place that documents the full
  renderer-visible capability surface of the application; review changes
  to it with the same scrutiny as the preload script itself.
