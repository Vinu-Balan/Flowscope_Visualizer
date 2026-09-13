# @flowscope/workspace

Owns project/workspace identity and lifecycle: opening a project, project
validation (Maven/Gradle detection — `MASTER_PLAN.md` §8), tracking what's
currently open, re-analysis, and the project-level identity that future
features (git branch/commit-aware graph snapshots, `MASTER_PLAN.md` §71)
will build on.

Backs the `project.open` / `project.scan` IPC operations
(`docs/adr/ADR-004-ipc-boundary.md`).

**Status:** not yet implemented — see `docs/sprints/SPRINT-1.md` /
Weekend 2.
