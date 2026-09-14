# SPRINT-2: Project Opening (Weekend 2)

## Goal

The user can select a project and get a real answer about whether
FlowScope can work with it — the visible result defined in
`docs/ROADMAP.md`'s ten-weekend plan. Sprint 1's "Open Project" recorded
whatever folder was picked and navigated straight to the workspace with no
validation; this sprint replaces that with real Maven/Gradle project
validation, honest error/warning states, and a Recent Projects list.

## Architecture touched

- `packages/workspace`: first real implementation — project identity
  (`ValidatedProject`), build-system detection (Maven/Gradle), and a
  best-effort "looks like Spring Boot" heuristic. Split into an isomorphic
  schema entry point (`@flowscope/workspace/project`) and a Node-only
  validator (`@flowscope/workspace`, main-process only) — same pattern as
  `packages/config`'s split in Sprint 1, for the same reason (keep
  `node:fs` out of anything the sandboxed preload might import).
- `packages/ipc`: new `project.validate` operation.
- `apps/desktop`: main process registers the new handler; renderer gets a
  real open-project flow (validate → navigate on success, explain on
  failure) and a Recent Projects list on the Welcome screen.

## Planned scope

- `validateProject(path)`: resolves the path, distinguishes "doesn't
  exist" (`ProjectNotFoundError`) from "exists but isn't a directory /
  isn't readable" (`InvalidProjectError`) from "a real directory but no
  Maven or Gradle project found in it" (`UnsupportedProjectError`) —
  exercising three of `packages/core`'s error categories in a real flow
  for the first time.
- Build-system detection: `pom.xml` → Maven; `build.gradle`,
  `build.gradle.kts`, `settings.gradle`, or `settings.gradle.kts` → Gradle.
- A non-blocking "looks like Spring Boot" heuristic (root build file
  contains the substring "spring-boot") — surfaced as a warning toast, not
  a hard failure, since Phase 1 targets Spring Boot but shouldn't refuse a
  multi-module project whose root build file doesn't mention it.
- Renderer: picking a folder (dialog or Ctrl+O) now validates before
  navigating; a real validation failure shows an explanatory toast and
  keeps the user on the Welcome screen instead of silently entering an
  empty workspace.
- Recent Projects list on the Welcome screen (`settings.recentProjects`,
  already persisted since Sprint 1 but never displayed) — clicking one
  re-validates it (the folder may have moved or been deleted since) and
  removes it from the list automatically if it's gone.
- Workspace screen and status bar show the validated project's name and
  build system instead of a raw path.

## What shipped

Everything in "Planned scope" above, plus one addition found necessary
during implementation: a **way back to the Welcome screen**. Nothing in
the original plan provided navigation away from the Workspace route once a
project was open (no "close project," no back button), which made the new
Recent Projects list unreachable after opening anything. Fixed by making
the "FlowScope" wordmark in the title bar a link to `/` — a small,
conventional addition (logo-as-home-link), not scope creep, since the
sprint's own goal ("select a project," implying you can also select a
_different_ one) depended on it.

Recent-project recording also moved from `project.open` (Sprint 1: recorded
the raw picked path unconditionally) to `project.validate` (recorded only
on `status: 'valid'`) — an invalid folder can no longer pollute the recent
list.

## Explicitly deferred to later sprints

Scanning the project's file tree (SPRINT-3), Java parsing (SPRINT-3),
Spring semantic analysis / real API discovery (SPRINT-4), everything
downstream. "Looks like Spring Boot" stays a shallow text-search heuristic
until real dependency parsing exists — it is never treated as certain.

## Acceptance criteria

- [x] `validateProject` correctly classifies: a valid Maven project, a
      valid Gradle project (both `build.gradle` and `build.gradle.kts`,
      and a multi-module layout with only `settings.gradle` at the root),
      a real directory with no build file, and a nonexistent path.
- [x] The "looks like Spring Boot" heuristic is advisory only — an
      unsupported-build-system folder is a hard stop; a valid
      Maven/Gradle project that doesn't look like Spring Boot still opens,
      with a warning.
- [x] Picking an invalid folder shows a specific, honest error message
      (not a generic failure) and does not navigate to the workspace.
- [x] Recent Projects appear on the Welcome screen and can be reopened
      with one click; a moved/deleted recent project is removed from the
      list automatically instead of failing silently or repeatedly.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` (85 tests), and `pnpm build`
      are all clean.
- [x] Verified by launching the actual built app and driving it end to end
      with real projects on disk: a valid Spring Boot Maven project (opened
      cleanly, no warning), a valid non-Spring-Boot Maven project (opened
      with the warning toast, exact wording confirmed), and a deleted
      recent project (error toast with the specific path, entry removed
      from Recent Projects, confirmed by re-rendering the list).

## Status

**Complete.** All acceptance criteria met and verified against the running
app, including the failure paths (not just the happy path). Next:
`SPRINT-3` (project scanner — discovering the Java source tree inside a
validated project).
