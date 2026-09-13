# Graph Model — `flowscope.json` Schema

`flowscope.json` is the versioned serialization of the BEG
(`packages/graph-schema` owns the schema + validators; `packages/graph-engine`
owns the in-memory model — see `docs/architecture/domain-model.md`).

## Top-level shape (target; implemented in Sprint work, not yet built)

```json
{
  "schemaVersion": "1.0",
  "project": {},
  "analysis": {},
  "apis": [],
  "graphs": []
}
```

Every serialized graph document carries: schema version, project identity,
analysis metadata, nodes, edges, APIs, source references, business
metadata, technical metadata, and confidence information
(`MASTER_PLAN.md` §17).

## Node types (extensible — do not force every implementation into one type)

`business-step`, `decision`, `validation`, `database-operation`,
`external-service`, `message-publish`, `message-consume`, `transformation`,
`authentication`, `authorization`, `transaction`, `response`, `error`,
`system-boundary`.

## Edge types (extensible; Phase 1 UI may expose only a subset)

`sequence`, `conditional`, `success`, `error`, `loop`, `parallel`,
`dependency`, `external-call`.

## Versioning & backward compatibility

The schema is versioned from the start (`schemaVersion`) and must never
break `flowscope.json` compatibility casually — see
`docs/adr/ADR-005-graph-schema-versioning.md`. Project/graph identity should
be designed so a future version can associate a graph snapshot with a git
branch/commit/analysis version, enabling architecture diffing across
commits (`MASTER_PLAN.md` §71, §44).

## Validation contract

`GraphValidator` (see `docs/architecture/analysis-pipeline.md`) must reject,
with actionable diagnostics, any graph that has: duplicate node IDs, edges
referencing missing nodes, invalid API references, invalid source
references, an unrecognized/missing schema version, missing required
fields, an unknown node/edge type, or an out-of-range confidence value.

## Status

Not yet implemented — no TypeScript types or JSON Schema exist yet. This
document is the contract to implement against in `packages/graph-schema`.
