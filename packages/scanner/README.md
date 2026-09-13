# @flowscope/scanner

`ProjectDiscoveryService`, `ProjectScanner`, and `JavaSourceIndexer`
(`docs/architecture/analysis-pipeline.md`): detects Maven/Gradle projects,
discovers Java source and resource files, applies project exclusions from
settings, and performs incremental, content-hash-based indexing so unchanged
files are skipped on re-analysis (`MASTER_PLAN.md` §35).

Feeds `packages/parser-java`. Designed to scale toward 10,000+ file
projects (`MASTER_PLAN.md` §34) without blocking the UI.

**Status:** not yet implemented — see `docs/sprints/SPRINT-1.md` /
Weekend 3.
