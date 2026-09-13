# ADR-005: `flowscope.json` Is Versioned and Backward-Compatible by Default

## Status

Accepted

## Context

`flowscope.json` (`packages/graph-schema`) is the on-disk/cache
representation of the BEG and will be read back across FlowScope versions
(re-opening a previously analyzed project), potentially compared across
commits in the future (`MASTER_PLAN.md` §44, §71), and eventually enriched
with runtime trace data without becoming a second graph format
(§37–38). Breaking the format casually would silently invalidate every
user's existing analysis cache and any future diffing/history features.

## Decision

Every serialized graph document carries an explicit `schemaVersion`.
`GraphValidator` (`docs/architecture/analysis-pipeline.md`) rejects
documents with a missing or unrecognized version rather than guessing.
Schema changes follow standard compatibility discipline:

- Additive, optional fields (e.g. a future optional per-node runtime
  summary for Phase 2) do not bump the major version.
- Breaking changes (removing/renaming required fields, changing a field's
  meaning) require a major version bump and, where practical, a migration
  path for existing cached `flowscope.json` files.
- Project and graph identity are structured so a future version can
  associate a graph snapshot with a git branch/commit/analysis version
  without a redesign (`MASTER_PLAN.md` §71).

## Consequences

- `packages/graph-schema` must ship the full schema definition, versioned
  types, and a validator together — never a type definition that drifts
  from what the validator actually accepts.
- Features like architecture diffing (§44) and runtime-trace enrichment
  (§37–38) are additive consumers of the existing schema, not reasons to
  fork a second graph format.
- Any schema change PR must state, in its description, whether it is
  additive or breaking, and bump `schemaVersion` accordingly.
