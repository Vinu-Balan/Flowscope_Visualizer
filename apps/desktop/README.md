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

**Status:** desktop shell implemented (SPRINT-1) — window, routing, command
palette, settings dialog, theme system, and the IPC-backed toolbar/status
bar. Real project validation landed in SPRINT-2: opening a folder (dialog,
Ctrl+O, or a Recent Projects entry on the Welcome screen) runs Maven/Gradle
detection via `packages/workspace` before entering the workspace, with
honest errors for an invalid folder and a non-blocking warning when a
project doesn't look like Spring Boot. SPRINT-3 wired up the Analyze button
(and Ctrl/Cmd+Shift+A): it scans the project's file tree via
`packages/scanner` and shows a real Java/resource file summary in the
Architecture sidebar. SPRINT-4 extended that same Analyze flow to parse
the project's Java files (`packages/parser-java`) and discover Spring MVC
REST endpoints (`packages/parser-spring`) right after the scan completes;
the Architecture sidebar now lists the discovered APIs (HTTP method badge
and path, click to select), and the center canvas reflects the current
selection. SPRINT-5 made that selection do something real: selecting an
API infers its business flow (`packages/business-analyzer` +
`packages/graph-engine`), and SPRINT-6 gave it a real home: the center
canvas now renders an actual interactive flowchart
(`packages/visualization`, Cytoscape.js + ELK.js) — decision nodes as
diamonds with "Yes"/"No" branch edges, colored by outcome, pan/zoom, laid
out top-to-bottom. Clicking a node selects it and fills the right-hand
panel with its full detail (business description, confidence, technical
name, source file/line) — the node itself stays short and legible, full
detail lives in that panel. Monaco isn't wired in yet; source navigation
(a working "Open Source" jump from that panel to the exact file/line)
lands at Weekend 8.

SPRINT-10 added packaging: `pnpm run dist:win` (`electron-builder`,
configured in this package's `package.json` `build` field) produces a
portable, no-install Windows build in `release/` — `build/icon.ico` is
this app's real icon (generated, not a placeholder), wired into both the
packaged `.exe` and the dev-mode `BrowserWindow`. No code signing or
auto-update yet — out of Phase 1 scope.
