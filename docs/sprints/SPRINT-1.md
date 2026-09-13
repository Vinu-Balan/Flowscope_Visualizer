# SPRINT-1: Desktop Foundation (Weekend 1)

## Goal

FlowScope launches with a professional desktop shell — the visible result
defined in `docs/ROADMAP.md`'s ten-weekend plan.

## Architecture touched

- `apps/desktop`: Electron main process + preload bridge + Vite-built React
  renderer.
- `packages/ui`: base design-system primitives (theming, layout shell).
- `packages/core`: `Result` type, base error classes, identifiers — first
  real usage.
- `packages/logging`: first real logger implementation, wired into the
  Electron main process.
- `packages/ipc`: first (minimal) typed IPC contract, even if only a
  health-check/ping operation to prove the boundary works end to end.

Follows the security posture fixed in `docs/adr/ADR-003-electron-architecture.md`
and `docs/architecture/security-architecture.md`: `contextIsolation: true`,
`nodeIntegration: false`, sandboxed where compatible, minimal preload
surface.

## Planned scope

- Electron main process boots a `BrowserWindow` loading the Vite dev server
  (dev) / built assets (prod).
- Renderer shows the target application shell layout from
  `MASTER_PLAN.md` §21 (toolbar / left sidebar / center canvas placeholder /
  inspector placeholder / status bar), all panels resizable via
  react-resizable-panels, styled with Tailwind + Radix, dark-first theme
  per `MASTER_PLAN.md` §65.
- Sidebar shows the two fixed tabs (Architecture, Trace Logs) with empty
  states (`MASTER_PLAN.md` §22, §64) — no real project data yet.
- Basic command system + keyboard shortcut scaffolding
  (`MASTER_PLAN.md` §67–68) wired to at least one real command (e.g.
  Ctrl/Cmd+O opening a native "Open Project" dialog stub).
- Settings scaffolding (`packages/config`) persisting to a local store —
  even if the only setting wired up initially is theme.
- Centralized logging (`packages/logging`) active in both main and
  renderer, no `console.log` left in application code paths.
- App-level error boundary and the five application states
  (`MASTER_PLAN.md` §62) demonstrated on at least a placeholder operation.

## Explicitly deferred to later sprints

Real project opening/validation (SPRINT-2), scanning/parsing
(SPRINT-3), API discovery (SPRINT-4), business flow inference (SPRINT-5),
real graph rendering (SPRINT-6), Inspector content (SPRINT-7), source
navigation (SPRINT-8), search (SPRINT-9), installer (SPRINT-10).

## Acceptance criteria

- [ ] `pnpm install` succeeds at the repo root.
- [ ] `pnpm --filter @flowscope/desktop dev` launches FlowScope as a desktop
      window with the target shell layout, dark theme, and resizable panels.
- [ ] `pnpm typecheck` and `pnpm lint` pass with zero errors, zero `any`.
- [ ] No `nodeIntegration`, `contextIsolation` is `true`, preload bridge
      exposes only the intended minimal surface (verified by reading the
      `BrowserWindow` webPreferences and preload script).
- [ ] At least one IPC round-trip (health-check) works renderer → main → renderer.
- [ ] Unit tests exist for whatever lands in `packages/core`,
      `packages/logging`, `packages/ipc` this sprint.
- [ ] Sidebar, empty states, and keyboard shortcut(s) are visually verified
      by actually running the app (not just type-checked).

## Status

Planned — not started. This is the next unit of implementation work for
FlowScope.
