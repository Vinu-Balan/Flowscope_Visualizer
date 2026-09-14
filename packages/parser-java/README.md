# @flowscope/parser-java

The Java parsing adapter: turns Java source text into a small,
framework-agnostic Java Semantic Model (package name; top-level `class`
declarations; their annotations and methods, each with a source line) using
`java-parser` — a pure JavaScript/TypeScript, Chevrotain-based Java
grammar, the same parser that powers `prettier-java`. See
`docs/adr/ADR-006-java-parsing-without-a-jvm.md` for why this replaced the
originally-planned JavaParser/JVM approach. Implements
`packages/parser-core`'s abstractions for Java specifically. Isolated from
Spring interpretation (`packages/parser-spring`) and from business
inference (`packages/business-analyzer`).

Its only public entry point is `parseJavaFile(source: string): Result<JavaSourceFile, ParserError>`
(`src/parse-java-file.ts`) — malformed input fails softly as a typed
`Result` error, never a thrown exception. There is no Node-only/isomorphic
split like `packages/config`/`packages/workspace`/`packages/scanner`:
nothing here is ever imported by the sandboxed preload script.

**Status:** implemented — see `docs/sprints/SPRINT-4.md` / Weekend 4.
