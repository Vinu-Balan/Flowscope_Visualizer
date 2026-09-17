# @flowscope/parser-spring

The Spring semantic analyzer (`MASTER_PLAN.md` §11): consumes the Java
Semantic Model produced by `packages/parser-java` and interprets Spring-
specific constructs into a Spring Semantic Model. Implemented so far:
REST endpoint discovery, both styles a real Spring Boot app might use —
Spring MVC (`@RestController`/`@Controller` classes, class-level
`@RequestMapping` base paths, method-level
`@GetMapping`/`@PostMapping`/`@PutMapping`/`@PatchMapping`/`@DeleteMapping`/
generic `@RequestMapping(method = ...)` shorthands) and JAX-RS/Jersey
(`docs/sprints/SPRINT-11.md`: a class-level `@Path` base — no
Spring-specific marker annotation needed — an optional method-level
`@Path` suffix, and a bare `@GET`/`@POST`/`@PUT`/`@PATCH`/`@DELETE`
marker carrying the HTTP verb separately from the URL; recognized
directly off the resource class's own annotations, not by resolving its
`JerseyConfig`/`ResourceConfig` registration). Both combine into the same
`DiscoveredApi` records (HTTP method, path, class/method name, source
file/line) — nothing downstream needs to know which framework produced
one. Bean wiring and transaction boundaries are not yet implemented,
deferred to later sprints as business flow inference needs them.

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

**Status:** implemented (REST endpoint discovery, Spring MVC and
JAX-RS/Jersey) — see `docs/sprints/SPRINT-4.md` / Weekend 4 and
`docs/sprints/SPRINT-11.md`.
