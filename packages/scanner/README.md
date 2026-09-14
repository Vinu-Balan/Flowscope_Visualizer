# @flowscope/scanner

`ProjectScanner` (`docs/architecture/analysis-pipeline.md`): given an
already-validated project (`packages/workspace`), discovers Java source
and resource files, classifies Java files by source set (`main`/`test`/
`other`), excludes build/VCS/IDE noise, and content-hashes everything
found so a future incremental-reanalysis pass can skip unchanged files
(`MASTER_PLAN.md` §35 — the hash is captured now; nothing reads it back
yet, there is no cache/persistence layer).

Published as two entry points, same reasoning as `@flowscope/config` and
`@flowscope/workspace` (see their READMEs): `@flowscope/scanner` is the
full barrel, including the Node-only `scanProject` (main-process only),
and `@flowscope/scanner/scan-result` is the zod schema for
`ProjectScanResult` alone — Node-free, safe for the sandboxed preload
script. See the comment atop `src/scan-result.ts`.

Feeds `packages/parser-java` (SPRINT-4 onward). Designed to scale toward
10,000+ file projects (`MASTER_PLAN.md` §34) without blocking the UI —
directory reads and content hashing both run with bounded concurrency.

**Status:** implemented (SPRINT-3) — `scanProject()` walks a project,
finds `.java` files under any path and resource files under
`src/{main,test}/resources`, and returns per-file size + sha256 content
hash. `ProjectDiscoveryService`/`JavaSourceIndexer` as named in
`docs/architecture/analysis-pipeline.md` are this package's conceptual
responsibility, not literal separate classes — revisit that split if a
real need for it emerges. No caching/persistence of hashes across runs yet.
