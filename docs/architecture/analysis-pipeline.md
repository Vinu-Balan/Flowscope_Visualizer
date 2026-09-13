# Analysis Pipeline

```
ProjectDiscoveryService
        ↓
ProjectScanner              (packages/scanner)
        ↓
JavaSourceIndexer           (packages/scanner)
        ↓
JavaParser                  (packages/parser-java, via JavaParser lib initially)
        ↓
SpringSemanticAnalyzer      (packages/parser-spring)
        ↓
BusinessAnalyzer            (packages/business-analyzer)
        ↓
GraphBuilder                (packages/graph-engine)
        ↓
GraphValidator              (packages/graph-engine)
        ↓
GraphSerializer             (packages/graph-schema)
```

Each stage has exactly one responsibility and depends only on the stage(s)
before it — never on the UI, never "reaching forward." This is what keeps
parsing isolated from business inference, and business inference isolated
from presentation (`MASTER_PLAN.md` §11, §69).

## Stage responsibilities

- **ProjectDiscoveryService / ProjectScanner**: locate and validate the
  project (Maven/Gradle detection), enumerate Java source and resource
  files, apply project exclusions from settings.
- **JavaSourceIndexer**: incremental, content-hash-aware indexing so
  unchanged files are not reprocessed (`MASTER_PLAN.md` §35).
- **JavaParser adapter**: produces a Java Semantic Model (AST + resolved
  symbols where practical). Isolated from Spring/business concerns.
- **SpringSemanticAnalyzer**: interprets the Java Semantic Model for Spring
  annotations, bean wiring, HTTP mappings, transaction boundaries →
  produces a Spring Semantic Model.
- **BusinessAnalyzer**: infers business-meaningful steps and confidence
  from the technical semantic models (`MASTER_PLAN.md` §12–13) → produces a
  Business Semantic Model.
- **GraphBuilder**: assembles the BEG from the Business Semantic Model
  (+ retained technical metadata for progressive disclosure).
- **GraphValidator**: rejects invalid graphs before they reach the UI —
  unique node IDs, valid edges/targets, valid API/source references, valid
  schema version, required fields, valid node/edge types, valid confidence
  values (`MASTER_PLAN.md` §70).
- **GraphSerializer**: writes/reads the versioned `flowscope.json`
  representation (`docs/architecture/graph-model.md`).

## Resilience

A single malformed or unparseable Java file must not abort the whole
analysis. The pipeline runs partial analysis and reports the failure
alongside a graph built from everything that did succeed (e.g. "999/1,000
files analyzed, 1 parse failure" with the affected area explained in the
Inspector) — `MASTER_PLAN.md` §73.

## Performance posture

Analysis must be backgroundable and cancellable end-to-end (`analysis.start`
/ `analysis.cancel` / `analysis.status` over IPC), must never block the
Electron renderer, and must scale toward 10,000+ Java files via incremental,
cached, and where-safe-parallel processing (`MASTER_PLAN.md` §34, §72).

## Status

Not yet implemented. This describes the target pipeline for
`apps/parser-engine` and the `packages/parser-*` / `packages/scanner` /
`packages/business-analyzer` / `packages/graph-engine` packages.
