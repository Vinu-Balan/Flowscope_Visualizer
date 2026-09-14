# Fixture: simple-customer-service

A small, real Spring Boot 3 Maven project used as a deterministic test
fixture (`docs/epics/EPIC-1.md` §"Test fixtures needed",
`MASTER_PLAN.md` §58) — not proprietary or real customer data.

Structure exercises what `packages/scanner` (SPRINT-3) and, later,
`packages/parser-java` / `packages/parser-spring` (SPRINT-4+) need to
handle:

- `src/main/java/.../CustomerApplication.java` — `@SpringBootApplication` entry point
- `src/main/java/.../CustomerController.java` — `@RestController` with `POST /customers` and `GET /customers/{id}`
- `src/main/java/.../CustomerService.java` — `@Service` with a validation branch (duplicate email) and a repository-shaped in-memory store
- `src/main/java/.../Customer.java` — plain data class
- `src/main/resources/application.properties` — resource discovery
- `src/test/java/.../CustomerServiceTest.java` — a `test` source-set file, kept separate from `main`

Used by `packages/scanner`'s tests as a real-project smoke check alongside
synthetic `mkdtemp`-based tests for edge cases. Do not add real/proprietary
data to this fixture — keep it small and self-contained.
