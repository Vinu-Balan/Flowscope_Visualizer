# @flowscope/parser-java

The Java parsing adapter: turns Java source text into a small,
framework-agnostic Java Semantic Model — package name; top-level `class`
declarations; their annotations, fields, and methods; and, per method, a
flat, source-ordered sequence of body events (calls, object construction,
`if` guards, `throw`s, `return`s — docs/sprints/SPRINT-5.md) — using
`java-parser`, a pure JavaScript/TypeScript, Chevrotain-based Java
grammar, the same parser that powers `prettier-java`. See
`docs/adr/ADR-006-java-parsing-without-a-jvm.md` for why this replaced the
originally-planned JavaParser/JVM approach. Implements
`packages/parser-core`'s abstractions for Java specifically. Isolated from
Spring interpretation (`packages/parser-spring`) and from business
inference (`packages/business-analyzer`).

Two public entry points: `parseJavaFile(source: string): Result<JavaSourceFile, ParserError>`
(`src/parse-java-file.ts`) parses one file's text — malformed input fails
softly as a typed `Result` error, never a thrown exception. `parseJavaFiles(projectPath, relativePaths): Result<ParseJavaFilesResult, AnalysisError>`
(`src/parse-java-files.ts`) is the Node-only, project-wide orchestration
(read + parse every file, skip failures, track counts) shared by
`packages/parser-spring`'s API discovery and `packages/business-analyzer`'s
flow inference, so a project's files are parsed once per analysis request
rather than twice. There is no Node-only/isomorphic split like
`packages/config`/`packages/workspace`/`packages/scanner`: nothing here is
ever imported by the sandboxed preload script.

Body-event extraction is deliberately generic rather than a hand-modeled
control-flow grammar (`src/extract-body-events.ts`, `src/cst-utils.ts`) —
only a method's direct block and one level into an `if`'s then-branch are
walked; loops, switch, try/catch, and lambdas aren't modeled. See
"Planned scope" in `docs/sprints/SPRINT-5.md`.

**Status:** implemented — see `docs/sprints/SPRINT-4.md` / Weekend 4 and
`docs/sprints/SPRINT-5.md` / Weekend 5.
