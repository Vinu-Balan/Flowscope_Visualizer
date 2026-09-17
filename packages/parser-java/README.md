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
a method's direct block, one level into an `if`'s then/else branches, and
(since SPRINT-12) a `try`/`catch`'s try-block and each catch clause are
walked; loops, switch, and lambdas still aren't modeled — scoped by
surveying real usage across the user's own Spring Boot projects rather
than guessing (`docs/sprints/SPRINT-9.md`: `switch` never appears in
either; `if`/`else` is the dominant conditional construct by a wide
margin. `docs/sprints/SPRINT-12.md`: `try`/`catch` is used systemically
as real business branching, not just error handling, in the user's
richest real project). See "Planned scope" in `docs/sprints/SPRINT-5.md`.

A `'try'` body event carries `tryEventCount` (how many following events
belong to the try-block itself) and `catchCount` (how many `'catch'`
events immediately follow); each `'catch'` event carries its own
`catchEventCount` plus `exceptionType` (shared with `'throw'`, whose
first-catch-type-only rule applies to a multi-catch
`catch (IOException | SQLException e)`) — the same flat,
count-bounded boundary-marking pattern `'if'`'s `thenEventCount`/
`elseEventCount` already established, generalized from 2 branches to N.
Covers both a plain `try` and `try (Resource r = ...)`
(try-with-resources; the resource declaration itself isn't modeled); a
`finally` clause isn't modeled at all (`docs/sprints/SPRINT-12.md`).

A `'return'` event also carries `returnsNestedCallTarget`/
`returnsNestedCallMethod`/`returnsNestedCallArgumentCount`/
`returnsNestedCallArgumentsText` — a call nested as the *first argument*
of the returned call, e.g. `bookingService.createBooking(request)` inside
`return ResponseEntity.ok(bookingService.createBooking(request));`.
Without this the single most common real Spring MVC controller shape —
a one-line delegation wrapped in a response type — had its actual
business call completely invisible, only the wrapper call ever
extracted (`docs/sprints/SPRINT-12.md`).

`unwrapToPrimary` also now recognizes a plain (non-declaring) assignment
expression's own CST shape (`x = call();`, not just a variable
declaration's initializer) and unwraps to its right-hand value rather
than its target variable — previously a reassignment's call was silently
dropped entirely, found via a real `catch` clause that reassigns an
already-declared variable to an alternate lookup (`docs/sprints/SPRINT-12.md`).

A `JavaMethod` also carries its declaration `line` and `parameterCount`
(arity) — the only two signals available, with no type checker, for
telling apart overloaded methods sharing a name; `packages/business-analyzer`
uses both to resolve a call or an API's entry point to the *right*
overload rather than always the first-declared one
(`docs/sprints/SPRINT-7.md`, found and fixed against a real Spring MVC
controller with a `GET`/`POST` handler pair sharing a name). A `JavaField`
also carries `stringConstantValue` when it's a `static final String`
assigned a literal — the `private static final String VIEW = "...";`
idiom of naming a view/redirect target once (SPRINT-7.md).

An `'if'` body event also carries `thenEventCount` and (when a real
`else` is present) `elseEventCount` — how many of the following events
belong to each branch, since the flat event list otherwise has no block
boundaries. Lets a consumer correctly bound *any* branch shape (not just
a bare `throw`/`return`), so a decision with a non-exiting then-branch
(a side effect that falls through, no `else`) still resolves to two real
edges instead of having its branch silently absorbed into whatever came
next (`docs/sprints/SPRINT-8.md`), and a real `else` — previously never
read at all — gets its own branch too, an `else if` chain composing
naturally as a nested `'if'` event within the else-branch's own slice
(`docs/sprints/SPRINT-9.md`). A separate `hasConditionCall` flag records
whether the condition itself resolved to a call and so pushed its own
`'call'` event — without it, a consumer can't tell "the next event is my
condition's call" from "there was no condition-call event, so the next
event is already the then-branch's first statement", which previously
let a call-shaped first then-statement get misread as the condition's
own call whenever the condition itself wasn't one (SPRINT-9.md). A
`'call'`/`'construct'`/`'throw'` event, and a call-valued `'return'`,
also carry the argument list exactly as written (`argumentsText` /
`returnsCallArgumentsText`, e.g. `name, categoryId, price`) — not an
evaluation, just the source text, always present as a string (empty for
a genuinely zero-argument call) so the Inspector's Technical panel can
show which variable is actually in play at a step (SPRINT-8.md).

**Status:** implemented — see `docs/sprints/SPRINT-4.md` / Weekend 4,
`docs/sprints/SPRINT-5.md` / Weekend 5, `docs/sprints/SPRINT-7.md`,
`docs/sprints/SPRINT-8.md`, `docs/sprints/SPRINT-9.md`, and
`docs/sprints/SPRINT-12.md`.
