# ADR-002: The Business Execution Graph Is the Canonical Domain Model

## Status

Accepted

## Context

FlowScope's product thesis (`MASTER_PLAN.md` §1–6) is that developers should
understand _business behavior_ before _technical architecture_, and that the
same underlying analysis must serve business, developer, and technical
audiences without re-analyzing the project for each. It would be easy — and
wrong — to treat `flowscope.json` or the Spring-specific technical model as
the "real" representation and the business view as a UI-only label applied
on top.

## Decision

The **Business Execution Graph (BEG)**, an in-memory domain model owned by
`packages/graph-engine`, is canonical. `flowscope.json`
(`packages/graph-schema`) is a serialization of the BEG, not the other way
around. The BEG is built from a **Business Semantic Model**
(`packages/business-analyzer`), which is itself derived from framework-
specific technical semantic models (e.g. the Spring Semantic Model from
`packages/parser-spring`) — but the BEG itself carries no Spring-specific
(or any framework-specific) concepts. Business/developer/technical detail
levels (`MASTER_PLAN.md` §6) are **projections** computed at read time from
one BEG, never separate generated graphs.

## Consequences

- `packages/graph-schema` and `packages/graph-engine` may not import from
  `packages/parser-spring` or any framework-specific package — enforced as
  an architectural rule in `docs/ARCHITECTURE.md` and
  `docs/CODING_GUIDELINES.md`.
- Adding a new framework adapter (.NET, Node, Python, Go — `MASTER_PLAN.md`
  §14) means writing a new `parser-*` + business-inference path that
  produces the same Business Semantic Model shape; it never requires
  changing the BEG or graph schema.
- Every node retains technical metadata and source provenance alongside its
  business metadata (`docs/architecture/domain-model.md`), so progressive
  disclosure is a UI concern, not a re-analysis concern.
- Runtime trace data (Phase 2) attaches to existing BEG nodes by `nodeId`
  rather than requiring a second graph model — see
  `docs/adr/ADR-005-graph-schema-versioning.md`.
