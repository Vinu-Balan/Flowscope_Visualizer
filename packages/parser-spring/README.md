# @flowscope/parser-spring

The Spring semantic analyzer (`MASTER_PLAN.md` §11): consumes the Java
Semantic Model produced by `packages/parser-java` and interprets Spring-
specific constructs into a Spring Semantic Model. Implemented so far:
REST endpoint discovery — `@RestController`/`@Controller` classes,
class-level `@RequestMapping` base paths, and method-level
`@GetMapping`/`@PostMapping`/`@PutMapping`/`@PatchMapping`/`@DeleteMapping`/
generic `@RequestMapping(method = ...)` shorthands, combined into
`DiscoveredApi` records (HTTP method, path, class/method name, source
file/line). Bean wiring and transaction boundaries are not yet
implemented, deferred to later sprints as business flow inference needs
them.

This is the **first** framework adapter, not a stand-in for the framework-
agnostic layers below it. `packages/business-analyzer` and everything above
it consumes the Spring Semantic Model without depending on this package
directly, so future adapters (.NET, Node, Python, Go — `MASTER_PLAN.md`
§14) can plug in at the same seam.

Publishes two entry points, like `packages/config`/`packages/workspace`/
`packages/scanner`: `@flowscope/parser-spring` (the full barrel, including
the Node-only `discoverApis`) and `@flowscope/parser-spring/api` (the zod
schema for `DiscoveredApi`, Node-free — safe for the sandboxed preload
script). See the comment atop `src/api.ts`. `discoverApis` itself is a
thin wrapper around `packages/parser-java`'s `parseJavaFiles` (Sprint 5
extracted the shared read+parse+resilience loop there once
`packages/business-analyzer` needed the same project-wide parsing).

**Status:** implemented (REST endpoint discovery) — see
`docs/sprints/SPRINT-4.md` / Weekend 4.
