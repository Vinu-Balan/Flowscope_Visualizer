# Security Architecture

FlowScope treats analyzed source code as highly sensitive business
information. See `MASTER_PLAN.md` §30–33, §47, §50 for the product-level
commitments this implements.

## Local-first

Source code, analysis results, the BEG, cache, and logs are local by
default. Nothing leaves the machine during normal Phase 1 operation: no
upload to a cloud service, no transmission to an external AI provider, no
telemetry carrying source content. Any future cloud/AI capability is
explicit opt-in with clear disclosure (what, why, where, retention,
training use, how to disable — no dark patterns; `MASTER_PLAN.md` §51).

## Electron hardening

- `contextIsolation: true` in every `BrowserWindow`.
- `nodeIntegration: false` in the renderer.
- Sandbox enabled where compatible with required functionality.
- A minimal, explicit preload bridge — no blanket API surface.
- The renderer never gets arbitrary filesystem, process, or Node module
  access; every capability it needs is a specific, validated IPC call.

## IPC contract discipline

`packages/ipc` defines a closed set of named operations (`project.open`,
`project.scan`, `analysis.start`, `analysis.cancel`, `analysis.status`,
`graph.load`, `graph.save`, `source.open`, …). There is no generic
`execute(command)`-style operation. Every request is validated on receipt;
every response is validated before use. See
`docs/adr/ADR-004-ipc-boundary.md`.

## Static analysis only

The analysis engine **never executes** analyzed Java code — parsing and
semantic analysis are strictly static. Project metadata and files on disk
are treated as untrusted input: paths are sanitized, path traversal is
prevented, and malformed/malicious project files must degrade gracefully
(see resilience posture in `docs/architecture/analysis-pipeline.md`) rather
than compromise the host application.

## Threat posture summary

| Surface                                | Control                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Untrusted project source on disk       | Static-only analysis; sanitized paths; partial-failure resilience                                 |
| Renderer ↔ Main boundary               | contextIsolation, no nodeIntegration, explicit preload bridge, validated typed IPC                |
| Project metadata (build files, config) | Never trusted blindly; parsed defensively                                                         |
| Telemetry / diagnostics                | Opt-in only; never includes source, credentials, tokens, secrets, or personal data                |
| Future AI features                     | Explicit deployment-model choice (local / private enterprise / cloud); privacy-preserving default |

## Status

These are binding constraints for all future implementation, not yet
exercised by code (no Electron app exists yet — see
`docs/sprints/SPRINT-1.md`). Revisit this document at the start of every
sprint that touches Electron main-process code, IPC, or the analysis
engine's filesystem access.
