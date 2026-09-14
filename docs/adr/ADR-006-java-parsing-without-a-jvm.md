# ADR-006: Java Parsing Uses a Pure JS/TS Parser, Not JavaParser/a JVM

## Status

Accepted

## Context

`MASTER_PLAN.md` §11 says "Use JavaParser initially" for Java parsing.
JavaParser is a JVM library. `MASTER_PLAN.md` §10 designates the long-term
analysis engine as Rust. `packages/parser-java/README.md` flagged this
tension explicitly since Sprint 1: something has to bridge a JVM-based
parser into an Electron (Node) or future Rust process, and deferred the
decision to "the sprint that starts real Java parsing" — this one
(SPRINT-4, API discovery, which requires reading Java files for Spring
annotations).

Bridging JavaParser would mean either requiring the user to have a JRE
installed (unacceptable for a "download and use" desktop tool with a
local-first, zero-setup promise — `MASTER_PLAN.md` §29, §63), or bundling
a JRE ourselves (tens to hundreds of MB, a real cross-platform packaging
and update burden `MASTER_PLAN.md` §77 doesn't currently budget for), plus
a subprocess/stdio protocol to shuttle parse requests and results across
the process boundary.

## Decision

Parse Java using **`java-parser`** (the JHipster team's pure JavaScript/
TypeScript, Chevrotain-based Java grammar, npm package `java-parser`) —
the same parser that powers `prettier-java`, a real, widely-used
production tool. It runs directly in the Electron main process, no JVM,
no bundling, no subprocess.

This is evaluated as a pragmatic choice for the current architecture (no
Rust engine exists yet — `apps/parser-engine` is still scaffolding,
per `MASTER_PLAN.md` §10 "it is acceptable to create the Rust engine
progressively"), not a reversal of the long-term Rust direction. If/when
`apps/parser-engine` becomes real, Java parsing can move there — Rust has
its own mature Java-parsing crates (e.g. `tree-sitter-java`) — without
this decision constraining that move, because `packages/parser-java`'s
public surface (`parseJavaFile(source) -> Result<JavaSourceFile, ...>`)
is a plain function boundary, not something callers reach past to touch
`java-parser` directly.

**Known tradeoff, accepted with mitigation:** `java-parser`'s dependency
tree (`chevrotain` → `@chevrotain/cst-dts-gen` → `lodash`/`lodash-es`)
carries known `lodash` advisories (prototype pollution / code injection in
`_.template`, `_.unset`, `_.omit`). Investigated and judged low-risk for
our usage: those vulnerable functions live in chevrotain's grammar
code-generation tooling, which we never invoke (we only call
`java-parser`'s `parse()`); the parsing itself runs in the unsandboxed
main process only, over local files the user already has full filesystem
access to — not attacker-supplied network input. Revisit if `java-parser`
ships a release that drops the vulnerable transitive chain, and re-run
`pnpm audit` whenever bumping this dependency.

## Consequences

- `packages/parser-java` has no Node-only/isomorphic split like
  `packages/config`/`packages/workspace`/`packages/scanner` — nothing in
  it is ever imported by the preload script (only the final
  `DiscoveredApi` schema in `packages/parser-spring/api` crosses that
  boundary, and it has zero dependency on `java-parser`).
- `java-parser` produces a full CST (concrete syntax tree), not a clean
  AST — `packages/parser-java` deliberately extracts only what FlowScope
  currently needs (package name; top-level `class` declarations; their
  annotations and methods, each with a single source line rather than a
  precise start/end range) rather than modeling the entire Java grammar.
  Extend it method-by-method as later sprints need more (fields, method
  parameters, interfaces/enums/records as first-class containers,
  precise line ranges for source navigation in SPRINT-8).
- A file `java-parser` can't parse (genuinely malformed Java, or Java
  syntax newer than the pinned version supports) is skipped, not fatal —
  same partial-analysis resilience principle as `packages/scanner`
  (`docs/architecture/analysis-pipeline.md`).
- Annotation matching is by simple name only (`RestController`, not
  `org.springframework.web.bind.annotation.RestController`) — no import
  resolution. This is a deliberate, documented heuristic consistent with
  `MASTER_PLAN.md` §12's confidence framing, not full semantic analysis.
- **Found during implementation:** the pinned `java-parser` version doesn't
  reliably recognize a `record` declared _inside_ another class body as a
  record — it falls back to parsing `record Inner(...) {}` as an ordinary
  method, and the exact misparsed CST shape varies by surrounding context
  (observed two different shapes in testing). Rather than chase every
  shape the misparse can take, `parseJavaFile` takes a more robust
  approach: a one-time regex scan of the raw source for `record <Name>(`
  declarations, and any "method" the CST visitor finds whose name matches
  is treated as this same misparse rather than a real method. See the
  comment on `collectRecordDeclarationNames` in
  `packages/parser-java/src/parse-java-file.ts`. Re-verify this workaround
  (and ideally replace it with correct nested-record parsing) when
  upgrading `java-parser`.
