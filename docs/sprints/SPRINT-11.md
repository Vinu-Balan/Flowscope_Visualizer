# SPRINT-11: JAX-RS/Jersey Endpoint Discovery

## Goal

Direct response to: *"the application must work with JerseyConfiguration
as well. Right now it is not able to recognize the endpoints if Jersey is
used."* API discovery (`packages/parser-spring`) only ever recognized
Spring MVC's annotation style (`@RestController`/`@Controller` +
`@GetMapping`/`@PostMapping`/etc.) — a project using Jersey (a JAX-RS
implementation, commonly embedded in a Spring Boot app via
`spring-boot-starter-jersey`, registered through a `JerseyConfig`-style
`ResourceConfig` subclass) produced zero discovered endpoints, silently.

## Investigation

Checked all of the user's real Spring Boot projects
(`E-commerce-project-springBoot`, `BookMyShow`, `InstagramClone`,
`resume-analyzer`) for an actual Jersey example to ground this in, the
same way SPRINT-7 through SPRINT-9 grounded their fixes — none use
Jersey; all are pure Spring MVC. Unlike those sprints, there's no
existing real code with framework-specific quirks to discover by reading
it. JAX-RS is a formal, stable JSR/Jakarta specification rather than a
convention some project happens to follow, so this sprint implements
directly against the spec's well-known annotation shapes instead, and
leans harder on tests (including through the real CST parser) to make up
for not having a real codebase to verify against.

## The JAX-RS routing model, and why it needs separate handling

Spring MVC's shorthand annotations (`@GetMapping("/x")`) combine the HTTP
verb and the URL in one annotation. JAX-RS splits them:

- `@Path("/products")` — a URL only, at class level (the resource's base
  path) and optionally again at method level (appended as a suffix).
- A separate **bare marker annotation** — `@GET`, `@POST`, `@PUT`,
  `@PATCH`, or `@DELETE` — carries the HTTP verb only, no URL, no
  arguments at all.
- No class-level "this is a controller" marker is required or
  conventional — a class-level `@Path` alone is what makes a class a
  JAX-RS resource.

A useful coincidence: JAX-RS's marker annotation names (`GET`, `POST`,
`PUT`, `PATCH`, `DELETE`) are *exactly* `HTTP_METHODS`'s own literal
values, so the existing `HTTP_METHOD_SET` (already built for Spring's
`@RequestMapping(method = ...)` form) doubles as the JAX-RS annotation
allowlist — no separate table needed.

## Architecture touched

- `packages/parser-spring/src/discover-apis-in-file.ts`: new
  `isJaxRsResourceType` (a class-level `@Path`) and
  `discoverJaxRsMethodApis` (per method: find an `HTTP_METHOD_SET` marker
  annotation for the verb, an optional method-level `@Path` for the
  suffix, `joinPaths` the two — reusing the exact same `joinPaths`/
  `annotationPath`/`makeApi` helpers Spring MVC discovery already uses).
  `discoverApisInFile` now checks both styles independently per type (a
  class could in principle have either, checked without assuming
  mutual exclusivity) and concatenates whatever each finds.
- No import-namespace check: `javax.ws.rs.GET` and the newer
  `jakarta.ws.rs.GET` extract identically, since ADR-006 never resolves
  imports — both "just work" without special-casing.
- Registration is deliberately **not** resolved: a real Jersey resource
  only actually serves requests once registered with a `ResourceConfig`
  (explicit `register(Foo.class)` or `packages("com.example")`
  scanning) — but discovery here works directly off the resource class's
  own annotations, the same scope boundary Spring MVC discovery already
  accepts (it doesn't verify `@ComponentScan` boundaries either).
  Resolving `packages(...)` scanning in particular would need to
  interpret a runtime classpath scan statically, well beyond what static
  analysis can promise without fabricating.

## Explicitly deferred to later sprints

JAX-RS sub-resource locators (a method with `@Path` but no HTTP-verb
annotation, delegating to another resource's methods at runtime) — not
modeled, same "never fabricate the verb" principle as Spring's ambiguous
`@RequestMapping`. `@QueryParam`/`@PathParam`/`@Produces`/`@Consumes`
detail — not surfaced (Spring's `@RequestParam`/`@PathVariable` aren't
either; parameter-level detail is out of `discoverApisInFile`'s scope
either way). `@ApplicationPath` (an alternate JAX-RS deployment style
where the whole application is mounted under a path via the
`ResourceConfig`/`Application` subclass itself) — not read, since no
real example exists to confirm the exact shape is worth the scope.

## Acceptance criteria

- [x] A class-level `@Path` plus a bare `@GET`/`@POST`/`@PUT`/`@PATCH`/
      `@DELETE` marker annotation produces a `DiscoveredApi`, with no
      Spring `@Controller`/`@RestController` needed.
- [x] A method-level `@Path` correctly suffixes the class-level base
      path; its absence correctly leaves the base path as-is.
- [x] A method with `@Path` but no HTTP-verb marker produces nothing,
      rather than guessing.
- [x] A file containing both a Spring MVC controller and a JAX-RS
      resource discovers both, independently.
- [x] Verified through the real CST parser (not just hand-built
      `JavaType` fixtures) against a JAX-RS resource class and a
      `JerseyConfig`-style `ResourceConfig` registration class written in
      the real, spec-accurate idiom — the registration class itself
      correctly contributes no endpoints of its own.
- [x] `pnpm typecheck`, `pnpm lint`, and `pnpm test` are all clean (247
      tests, 10 new).

## Status

Complete.
