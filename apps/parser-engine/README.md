# flowscope-parser-engine

The long-term Rust static analysis engine (`MASTER_PLAN.md` §10). Owns the
analysis pipeline: project scanning, Java parsing, Spring semantic
analysis, business inference, and Business Execution Graph construction —
invoked by `@flowscope/desktop` only through the typed IPC contract in
`packages/ipc`, never coupled directly to the UI.

```
Project scanner → Java parser → Spring semantic analyzer →
Business analyzer → Graph builder → BEG → flowscope.json
```

Per `MASTER_PLAN.md` §10, it is acceptable to build this engine up
progressively rather than all at once — early sprints may stub or
partially implement stages, but the pipeline shape and package boundaries
(`docs/architecture/analysis-pipeline.md`) should not be violated even in
early versions. Analysis is strictly static: analyzed Java code is never
executed (`docs/architecture/security-architecture.md`).

**Status:** not yet implemented — only the crate manifest exists. No `src/`
yet; real implementation begins once the Phase 1 roadmap reaches project
scanning (`docs/ROADMAP.md`, Weekend 3 onward).
