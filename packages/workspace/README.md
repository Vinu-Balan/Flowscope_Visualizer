# @flowscope/workspace

Owns project/workspace identity and lifecycle: opening a project, project
validation (Maven/Gradle detection — `MASTER_PLAN.md` §8), tracking what's
currently open, re-analysis, and the project-level identity that future
features (git branch/commit-aware graph snapshots, `MASTER_PLAN.md` §71)
will build on.

Backs the `project.validate` IPC operation
(`docs/adr/ADR-004-ipc-boundary.md`); `project.scan` (reading the Java
source tree) lands in SPRINT-3.

Published as two entry points, same reasoning as `@flowscope/config`
(see its README): `@flowscope/workspace` is the full barrel, including the
Node-only `validateProject` (main-process only), and
`@flowscope/workspace/project` is the zod schema for `ValidatedProject`
alone — Node-free, safe for the sandboxed preload script. See the comment
atop `src/project.ts`.

**Status:** implemented (SPRINT-2) — `validateProject()` detects Maven
(`pom.xml`) and Gradle (`build.gradle`, `build.gradle.kts`,
`settings.gradle`, `settings.gradle.kts`) projects, distinguishes a
missing path from an unreadable one from a real folder with no recognized
build system (three of `packages/core`'s error categories), and applies a
non-blocking "looks like Spring Boot" text heuristic. Git/commit-aware
project identity is still just a concept, added when SPRINT-3+ needs it.
