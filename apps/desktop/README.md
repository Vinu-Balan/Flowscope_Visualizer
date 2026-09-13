# @flowscope/desktop

The Electron + React + TypeScript desktop application shell — FlowScope's
only end-user-facing application in Phase 1.

Owns: window lifecycle, the renderer UI (toolbar, sidebar, graph canvas,
inspector, status bar — `MASTER_PLAN.md` §21), the Electron main process,
and the preload bridge exposing the typed operations defined in
`packages/ipc`. Composes `packages/ui`, `packages/visualization`, and
Monaco for the actual UI; contains no parsing or business-inference logic
itself (`docs/ARCHITECTURE.md`, `docs/CODING_GUIDELINES.md`).

Security posture: `contextIsolation: true`, `nodeIntegration: false`,
sandboxed where compatible, minimal preload surface — see
`docs/adr/ADR-003-electron-architecture.md` and
`docs/architecture/security-architecture.md`.

**Status:** not yet implemented — see `docs/sprints/SPRINT-1.md`.
