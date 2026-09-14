# SPRINT-4: API Discovery (Weekend 4)

## Goal

Discovered APIs appear in the Architecture sidebar — the visible result
defined in `docs/ROADMAP.md`'s ten-weekend plan. This is the sprint where
FlowScope reads Java file _contents_ for the first time, and where the
JavaParser-vs-JVM question flagged since Sprint 1 finally gets resolved —
see `docs/adr/ADR-006-java-parsing-without-a-jvm.md`.

## Architecture touched

- `packages/parser-java`: first real implementation — `parseJavaFile`
  turns Java source text into a small, framework-agnostic Java Semantic
  Model (package, top-level classes, their annotations and methods) using
  `java-parser` (ADR-006). No Node-only/isomorphic split needed — nothing
  in it crosses the IPC boundary.
- `packages/parser-spring`: first real implementation — interprets the
  Java Semantic Model for Spring MVC routing annotations
  (`@RestController`/`@Controller`, `@RequestMapping` and the
  `@GetMapping`/`@PostMapping`/`@PutMapping`/`@PatchMapping`/
  `@DeleteMapping` shorthands) and produces `DiscoveredApi` records —
  HTTP method + path + source location. Same isomorphic-schema /
  Node-only-implementation split as `packages/config`/`packages/workspace`/
  `packages/scanner` (`@flowscope/parser-spring/api` vs.
  `@flowscope/parser-spring`).
- `packages/core`: `mapWithConcurrency` moved here from `packages/scanner`
  (now used by both scanner and parser-spring) — first cross-package
  utility reuse, per `docs/CODING_GUIDELINES.md` ("no duplicate
  utilities").
- `packages/ipc`: new `project.discoverApis` operation.
- `apps/desktop`: `useAnalyzeProjectFlow` extended to scan _then_ discover
  APIs in one Analyze click; the Architecture sidebar shows a real,
  clickable API list instead of an empty state once discovery succeeds.

## Planned scope

- Java parsing covers top-level `class` declarations only (not nested
  classes/interfaces/enums/records as first-class containers — a nested
  type's own methods, if any, are a documented, low-impact imprecision
  for now). Annotation values are extracted for both forms Spring
  supports: a bare single value (`@GetMapping("/x")`) and named
  element-value pairs (`@RequestMapping(value = "/x", method =
RequestMethod.POST)`), including arrays of enum constants
  (`method = {RequestMethod.GET, RequestMethod.HEAD}`).
- Controller detection: a class annotated `@RestController` or
  `@Controller`. Base path from a class-level `@RequestMapping`'s
  `value`/`path` (or bare value). Per-method HTTP verb + path from the
  method-level mapping annotation, combined with the base path.
  `@RequestMapping` with no explicit `method` (which in real Spring
  matches every HTTP verb) is skipped rather than guessed at — FlowScope
  never fabricates certainty it doesn't have (`MASTER_PLAN.md` §12).
- A file that fails to parse is skipped, not fatal, consistent with
  `packages/scanner`'s resilience principle — the operation reports how
  many files parsed successfully vs. failed.
- Renderer: clicking Analyze now scans _and_ discovers APIs in one flow;
  the Architecture sidebar lists discovered APIs (method badge + path),
  selectable — selecting one updates the center canvas's empty state to
  name the selected API, since the business-flow view itself is
  SPRINT-5's work.

## Explicitly deferred to later sprints

Business flow inference (SPRINT-5) — selecting an API only acknowledges
the selection for now, it doesn't render a flow. Nested type declarations,
method parameters, and precise line _ranges_ (vs. a single source line)
are extended only as later sprints need them (source navigation in
SPRINT-8 will likely need the latter). Import-based annotation resolution
(vs. simple-name matching) stays a documented heuristic.

## Acceptance criteria

- [x] `parseJavaFile` correctly extracts package, class name, class-level
      and method-level annotations (both bare-value and named-pair forms,
      including array values) from real Java source, and fails softly
      (a `Result` error, not a thrown exception escaping the function) on
      malformed input. Verified by 13 unit tests in
      `packages/parser-java/src/parse-java-file.test.ts`, including a
      dedicated test for a nested record/class not being attributed to the
      enclosing class's method list.
- [x] `discoverApisInFile` correctly identifies REST endpoints in the
      `simple-customer-service` fixture: exactly `POST /customers` and
      `GET /customers/{id}`, with correct class/method names and source
      lines. Verified by
      `packages/parser-spring/src/discover-apis-in-file.integration.test.ts`
      against the real fixture files (not hand-built fixtures).
- [x] A non-controller class (no `@RestController`/`@Controller`)
      contributes no APIs. Verified by unit test and by the integration
      test confirming `CustomerService`, `Customer`, and
      `CustomerApplication` contribute zero APIs.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` are all
      clean — 22 test files, 133 tests, across the whole workspace.
- [x] Verified by launching the actual built app (`electron-vite build` +
      the packaged `out/main/index.js`) against the real
      `simple-customer-service` fixture: clicking Analyze produced the
      toast "5 Java files scanned, 2 APIs discovered in
      simple-customer-service", the Architecture sidebar listed exactly
      `POST /customers` (`CustomerController.register`) and
      `GET /customers/{id}` (`CustomerController.findById`), and selecting
      the `POST /customers` row highlighted it and updated the center
      canvas to "Selected: POST /customers — business flow inference lands
      in a later sprint." The preload bundle (`out/preload/index.js`) was
      grepped and confirmed free of `node:fs`, `java-parser`, and
      `chevrotain`.

## Status

Complete.
