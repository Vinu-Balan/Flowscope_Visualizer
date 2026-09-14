# tests/

Cross-package integration/e2e fixtures and suites that don't belong inside
a single package's own `src`/`tests` — notably the deterministic sample
Spring Boot projects used to test the analysis pipeline
(`MASTER_PLAN.md` §58). No real or proprietary data.

`fixtures/simple-customer-service` landed in SPRINT-3 (see its own
README) and is used by `packages/scanner`'s tests today; SPRINT-4+'s
parser packages should reuse it rather than inventing another one.
`order-service`, `payment-service`, `error-handling-service`, and
`large-project-fixture` are added as later sprints need what they
specifically exercise (external calls, payment/transaction branches,
error handling, and scale, respectively).

Package-local unit/integration tests live alongside their package's source
per `docs/CODING_GUIDELINES.md`, not here.
