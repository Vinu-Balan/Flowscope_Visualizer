# @flowscope/core

Cross-cutting infrastructure shared by every other FlowScope package:
`errors/` (the centralized error categories from `docs/CODING_GUIDELINES.md`),
`events/`, `types/`, `result/` (a `Result<T, E>` type used instead of
throwing across module boundaries), `identifiers/`, `validation/`, and
general `utilities/`.

Depended on by nearly everything; depends on nothing else in the monorepo.
No other package should reimplement what belongs here — check `core` (and
`packages/shared`) before adding a new cross-cutting utility
(`docs/CODING_GUIDELINES.md`).

**Status:** implemented (SPRINT-1) — `Result<T, E>`, the `FlowScopeError`
hierarchy, and `createId()`. `mapWithConcurrency` (bounded-concurrency
async mapping) was added in SPRINT-4, extracted from `packages/scanner`
once `packages/parser-spring` needed the same utility (`docs/CODING_GUIDELINES.md`'s
"no duplicate utilities" rule). `events/`, `types/`, and `validation/` are
still just concepts, added when a concrete need arises.
