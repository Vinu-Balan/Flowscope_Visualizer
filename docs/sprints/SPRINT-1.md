# SPRINT-1: Desktop Foundation (Weekend 1)

## Goal

FlowScope launches with a professional desktop shell — the visible result
defined in `docs/ROADMAP.md`'s ten-weekend plan.

## Architecture touched

- `apps/desktop`: Electron main process + preload bridge + Vite-built React
  renderer (via `electron-vite`).
- `packages/ui`: design-system primitives (Button, Tooltip, Tabs, Dialog,
  ScrollArea, Separator, EmptyState, Kbd, StatusBarItem, Toast) built on
  Radix UI + Tailwind + `class-variance-authority`, dark-first theming via
  CSS custom properties.
- `packages/core`: `Result` type, the `FlowScopeError` hierarchy, `createId`.
- `packages/logging`: leveled logger with console + file transports,
  redaction of sensitive metadata; wired into the Electron main process.
- `packages/config`: zod-validated `Settings` schema + `SettingsStore`
  (atomic JSON persistence, defensive fallback on missing/corrupt files).
- `packages/ipc`: the full IPC contract (`system.ping`, `project.open`,
  `settings.get`, `settings.update`) — named channels, zod request/response
  schemas, a `parseOrThrow` validation helper used on both sides of the
  boundary.

Follows the security posture fixed in `docs/adr/ADR-003-electron-architecture.md`
and `docs/architecture/security-architecture.md`: `contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`, an explicit preload bridge with
no generic passthrough, `will-navigate` blocked, external links forced
through `shell.openExternal`.

## What shipped (beyond the original plan — see "found during implementation")

- **Desktop shell**: native window (1440×900, resizable), in-content
  toolbar (Open Project / Analyze-disabled / Search / Settings), status bar
  (engine connectivity, current project, Ready state).
- **Two routes** via TanStack Router (memory history — no address bar in a
  desktop app): a **Welcome** screen (first-launch flow per `MASTER_PLAN.md`
  §63) and a **Workspace** screen (three-pane resizable layout — Architecture
  sidebar / canvas / inspector — via `react-resizable-panels`, each pane a
  correctly-worded empty state instead of a blank canvas).
- **Sidebar**: Architecture / Trace Logs tabs (Radix Tabs), each with an
  honest empty state — no fake data.
- **Command palette** (`cmdk`, Ctrl/Cmd+K or Ctrl/Cmd+P): Open Project,
  Open Settings, and the three theme commands, fuzzy-searchable.
- **Settings dialog** (Ctrl/Cmd+,): theme picker (Light/Dark/System),
  backed by real IPC round-trips to `SettingsStore`.
- **Keyboard shortcut system**: one central `useKeyboardShortcuts` hook
  (MASTER_PLAN.md §67–68) — no scattered `addEventListener` calls.
- **Theme system**: persisted preference + live OS `prefers-color-scheme`
  sync, applied via a `data-theme` attribute and CSS custom properties
  (dark-first, matches the VS Code/Linear-inspired visual language in
  `MASTER_PLAN.md` §20, §65).
- **Toasts** and an **app-level error boundary** for the five application
  states (`MASTER_PLAN.md` §62).
- **Tests**: 67 unit tests across `core`/`logging`/`config`/`ipc`/the
  renderer store, all passing.

## Found and fixed during implementation

**Preload bundle pulled in Node-only code and crashed the sandboxed
preload script.** `packages/ipc`'s settings contract imported zod schemas
from `@flowscope/config`'s package root, whose barrel also re-exports
`SettingsStore` (which uses `node:fs/promises`). Rollup bundled that
transitively into the preload script even though preload never calls
`SettingsStore` — and Electron's sandboxed preload context (`sandbox: true`)
can't resolve `node:fs/promises`, so the window loaded with no working
preload bridge at all (`window.flowscope` undefined, every IPC call
failing). Fixed by splitting `@flowscope/config` into two entry points:
the framework-agnostic schema at `@flowscope/config/settings` (what
`packages/ipc` now imports) and the full barrel with `SettingsStore` at
`@flowscope/config` (main-process only). See the comment atop
`packages/config/src/settings.ts`. This was caught by actually launching
the built app and inspecting the console — not by typecheck/lint/tests,
none of which could have caught a bundler-transitive-dependency issue —
which is why "run the real app" stays a required verification step, not
just typecheck/lint/test.

**Several strict-lint findings that were real code quality issues**, not
just style: unserialized concurrent writes in the log file transport (fixed
by chaining writes onto a queue promise — see `createFileTransport`),
`navigator.platform` (deprecated) swapped for a `userAgent` check, and a
few `this`-unsafe method references in the toast store fixed with
`this: void` annotations.

## Explicitly deferred to later sprints

Real project opening/validation (SPRINT-2), scanning/parsing (SPRINT-3),
API discovery (SPRINT-4), business flow inference (SPRINT-5), real graph
rendering (SPRINT-6), Inspector content (SPRINT-7), source navigation
(SPRINT-8), search (SPRINT-9), installer/packaging via electron-builder
(SPRINT-10). The "Analyze" toolbar button is present but disabled with an
explanatory tooltip rather than faked.

Also deferred: Playwright e2e wiring (the roadmap places dedicated e2e
work at Weekend 9–10); this sprint's verification was direct manual/
automated inspection of the built app (see below) plus unit tests.

## Known follow-ups (not blockers, tracked for later sprints)

- Renderer JS bundle is ~1.58 MB unminified-equivalent (single chunk, no
  code-splitting yet) — worth revisiting once Monaco/Cytoscape land in
  later sprints and make this more pressing.
- `apps/parser-engine` (Rust) is still unimplemented — untouched this
  sprint, as planned.

## Acceptance criteria

- [x] `pnpm install` succeeds at the repo root.
- [x] `pnpm --filter @flowscope/desktop dev` / `build` launches FlowScope as
      a desktop window with the target shell layout, dark/light theme, and
      resizable panels.
- [x] `pnpm typecheck` and `pnpm lint` pass with zero errors, zero `any`.
- [x] No `nodeIntegration`, `contextIsolation` is `true`, `sandbox: true`,
      preload bridge exposes only four named methods (verified by reading
      `src/main/window.ts` and `src/preload/index.ts`).
- [x] IPC round-trips work renderer → main → renderer: `system.ping`
      (status bar shows "Engine connected"), `settings.get`/`settings.update`
      (theme picker changes persist and re-apply live), `project.open`
      (native folder picker, result recorded to recent projects).
- [x] Unit tests exist for `packages/core`, `packages/logging`,
      `packages/config`, `packages/ipc`, and the renderer's app store — 67
      tests, all passing (`pnpm test`).
- [x] Sidebar, empty states, keyboard shortcuts (Ctrl+O, Ctrl+K/P, Ctrl+,),
      the command palette, and the settings dialog were visually verified
      by launching the actual built app and driving it with real OS-level
      keyboard/mouse input (not just type-checked) — see verification notes
      in the handoff message for this sprint.

## Status

**Complete.** All acceptance criteria met and verified against the running
app. Next: `SPRINT-2` (project opening — real validation of the selected
folder as a Maven/Gradle project, replacing today's "record the path and
move on").
