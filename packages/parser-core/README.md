# @flowscope/parser-core

Framework- and language-agnostic parsing/AST abstractions shared by
language-specific parser adapters (`packages/parser-java` today; future
adapters for other ecosystems per `MASTER_PLAN.md` §14). Defines the
common shape a "technical semantic model" takes before any Spring- or
business-specific interpretation happens (`docs/architecture/analysis-pipeline.md`).

Contains no Java-specific or Spring-specific logic itself.

**Status:** not yet implemented — see `docs/sprints/SPRINT-1.md` /
Weekend 3.
