# SPRINT-3: Project Scanner (Weekend 3)

## Goal

Java files and project structure are discovered — the visible result
defined in `docs/ROADMAP.md`'s ten-weekend plan. The "Analyze" toolbar
button, disabled since Sprint 1, does something real for the first time:
it walks the validated project's file tree and reports what it found.

## Architecture touched

- `packages/scanner`: first real implementation — `scanProject(path)`
  walks a validated project directory, discovers Java source files and
  resource files, classifies Java files by source set (`main`/`test`/
  `other`), and content-hashes everything found (`MASTER_PLAN.md` §35 —
  the hash is captured now so a future incremental-reanalysis pass can
  skip unchanged files; there is no cache/persistence layer yet, this
  sprint only produces the hash). Same isomorphic-schema /
  Node-only-implementation split as `packages/config` and
  `packages/workspace` (`@flowscope/scanner/scan-result` vs.
  `@flowscope/scanner`) — the preload script needs the schema, never the
  `node:fs`-based walker.
- `packages/ipc`: new `project.scan` operation.
- `apps/desktop`: main process registers the handler; the toolbar's
  Analyze button (and a new Ctrl/Cmd+Shift+A shortcut, per
  `MASTER_PLAN.md` §67) triggers a scan and the Architecture sidebar shows
  a real summary instead of always being empty.
- `tests/fixtures/simple-customer-service`: the first real fixture project
  (`docs/epics/EPIC-1.md` flagged this as starting in SPRINT-3) — a small
  but real Spring Boot Maven project (controller, service, entity,
  resources, one test) that this sprint's scanner tests run against, and
  that SPRINT-4's parser will reuse rather than every sprint inventing its
  own throwaway fixture.

## Planned scope

- Directory walk excludes build/VCS/IDE noise (`node_modules`, `target`,
  `build`, `out`, `dist`, `bin`, and anything starting with `.`) and never
  follows symlinks.
- Java source classification by path convention: `src/main/java/**` →
  `main`, `src/test/java/**` → `test`, anything else ending in `.java` →
  `other` (non-standard layouts are still reported, never silently
  dropped).
- Resource discovery: any file under `src/main/resources/**` or
  `src/test/resources/**`, regardless of extension.
- A failed stat/read on an individual file or directory is skipped, not
  fatal — consistent with the partial-analysis resilience principle in
  `docs/architecture/analysis-pipeline.md`. The scan as a whole only fails
  if the project root itself can't be read (e.g. it was deleted after
  validation), reported as an `AnalysisError`.
- Renderer: the Analyze button is enabled once a project is open; clicking
  it (or Ctrl/Cmd+Shift+A) scans and shows a result summary in the
  Architecture sidebar — Java file count by source set, resource file
  count — with loading and error states, not just success.

## Explicitly deferred to later sprints

Actually parsing Java file contents (SPRINT-4, which is also when the
JavaParser-vs-JS-parser architecture decision flagged in
`packages/parser-java/README.md` needs to be made), Spring annotation
analysis, API discovery, and everything downstream. No caching/persistence
of scan results across app restarts yet (`MASTER_PLAN.md` §35–36) — a
content hash is captured for future use, but nothing reads it back yet.
No progress streaming for very large scans — a single request/response
round trip with a loading state is enough for this sprint's scale; true
incremental progress events are deferred until a genuinely long-running
operation (full analysis) needs them.

## What shipped

Everything in "Planned scope," plus a shared `useAnalyzeProjectFlow` hook
(the same pattern `useOpenProjectFlow` established in Sprint 2) so the
toolbar button, the Ctrl/Cmd+Shift+A shortcut, and a new "Analyze Project"
command-palette entry (shown only when a project is open) all drive one
implementation instead of three. The Architecture sidebar's empty-state
copy now changes honestly depending on scan state — "Open a project and
click Analyze…" before any scan, "Java files were found, but parsing them
for APIs lands in a later sprint" after one — rather than a single static
message that would go stale the moment scanning became real.

`useProjectScanQuery` is a deliberately "lazy" TanStack Query (`enabled:
false`, triggered by `refetch()`) rather than a mutation, specifically so
the toolbar (which triggers it) and the sidebar (which only reads
`data`/`isFetching`/`error`) share one cache entry keyed by project path
without any bespoke shared state — the same trick a `useQuery` with a
manual `refetch()` gives you for free.

## Found and fixed during implementation

A grammar bug in the success toast — `"1 resource files"` instead of
`"1 resource file"` — caught by actually reading the toast after a real
scan against the fixture project, not by any automated check (pluralization
bugs don't fail typecheck/lint/tests). Fixed with a small `pluralize()`
helper in `use-analyze-project.ts`, applied to both the Java-file and
resource-file counts.

## Acceptance criteria

- [x] `scanProject` correctly walks a real fixture project and finds the
      expected Java files (split correctly by main/test) and resource
      files, and correctly excludes build-output directories.
- [x] A project whose root folder disappears between validation and
      scanning fails with a specific, honest error rather than reporting
      an empty (and misleading) result.
- [x] The Analyze button is disabled with an explanatory tooltip when no
      project is open, enabled once one is, and shows a loading state
      while scanning.
- [x] The Architecture sidebar shows a real Java/resource file summary
      after a successful scan, and a specific error message on failure.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` (95 tests), and
      `pnpm build` are all clean.
- [x] Verified by launching the actual built app against the real
      `simple-customer-service` fixture: opened it from Recent Projects,
      clicked Analyze, confirmed the sidebar showed "5 Java files — 4
      main · 1 test · 1 resource" (matching the fixture exactly) and a
      correctly-worded success toast, then re-triggered the same scan via
      Ctrl+Shift+A and confirmed it worked identically.

## Status

**Complete.** All acceptance criteria met and verified against the running
app with a real project. Next: `SPRINT-4` (API discovery — parsing Java
files for Spring annotations, which is also when the
JavaParser-vs-JS-parser decision in `packages/parser-java/README.md`
finally has to be made).
