# System Architecture

## Process topology

```
┌─────────────────────────────────────────────────────────────────┐
│ Electron Main Process                                            │
│  - window lifecycle, native menus, filesystem access (guarded)   │
│  - IPC handlers (packages/ipc) — the only bridge to the renderer │
│  - spawns / talks to the Rust analysis engine (apps/parser-engine)│
└───────────────┬─────────────────────────────────────────────────┘
                │ typed IPC (packages/ipc), context-isolated
┌───────────────▼─────────────────────────────────────────────────┐
│ Electron Renderer Process (apps/desktop)                         │
│  - React + Zustand + TanStack Router/Query                       │
│  - packages/ui, packages/visualization (Cytoscape.js + ELK.js)   │
│  - Monaco Editor for source viewing                               │
│  - no direct Node.js, no direct filesystem, no direct process     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Rust Analysis Engine (apps/parser-engine)                        │
│  Project Scanner → Java Parser → Spring Semantic Analyzer →      │
│  Business Analyzer → Graph Builder → BEG → flowscope.json        │
│  - static analysis only; never executes analyzed code            │
└─────────────────────────────────────────────────────────────────┘
```

## Why a separate analysis engine process

Analysis on large enterprise codebases (target: 10,000+ Java files, see
`MASTER_PLAN.md` §34) is CPU-heavy and must never block the renderer. Running
it as a separate engine (eventually Rust, invoked via IPC) keeps the UI
responsive, makes analysis cancellable, and keeps a hard boundary between
"things that parse untrusted project source" and "things that render UI" —
see `docs/architecture/security-architecture.md`.

## Data flow for the core demo

```
User opens project
  → project.open (IPC) → workspace package validates & records project identity
User clicks Analyze
  → analysis.start (IPC) → parser-engine runs the pipeline
  → analysis.status (IPC, polled/streamed) → progress in the UI
  → graph.load (IPC) → BEG (validated) → graph-engine → visualization
User selects API / node
  → graph-engine projects the BEG at the current detail level
  → Inspector reads node metadata + source reference
User clicks "Open Source"
  → source.open (IPC) → sanitized path → Monaco jumps to file:line
```

This flow is the reference for what `packages/ipc` needs to expose; keep it
in sync as the contract is implemented.
