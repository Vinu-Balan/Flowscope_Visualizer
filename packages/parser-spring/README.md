# @flowscope/parser-spring

The Spring semantic analyzer (`MASTER_PLAN.md` §11): consumes the Java
Semantic Model produced by `packages/parser-java` and interprets Spring-
specific constructs — annotations, bean wiring, HTTP mappings (GET/POST/
PUT/PATCH/DELETE), transaction boundaries — into a Spring Semantic Model.

This is the **first** framework adapter, not a stand-in for the framework-
agnostic layers below it. `packages/business-analyzer` and everything above
it consumes the Spring Semantic Model without depending on this package
directly, so future adapters (.NET, Node, Python, Go — `MASTER_PLAN.md`
§14) can plug in at the same seam.

**Status:** not yet implemented — see `docs/sprints/SPRINT-1.md` /
Weekend 3–4.
