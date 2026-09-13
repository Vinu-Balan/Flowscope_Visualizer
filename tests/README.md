# tests/

Cross-package integration/e2e fixtures and suites that don't belong inside
a single package's own `src`/`tests` — notably the deterministic sample
Spring Boot projects used to test the analysis pipeline
(`MASTER_PLAN.md` §58): `simple-customer-service`, `order-service`,
`payment-service`, `error-handling-service`, `large-project-fixture`, to be
added under `tests/fixtures/` starting with `docs/sprints/` Weekend 3
(project scanner). No real or proprietary data.

Package-local unit/integration tests live alongside their package's source
per `docs/CODING_GUIDELINES.md`, not here.
