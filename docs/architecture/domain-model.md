# Domain Model — the Business Execution Graph

The BEG is the canonical, framework-independent, in-memory domain model.
`flowscope.json` is a serialization of it, not the model itself. See
`MASTER_PLAN.md` §5–6, §11–13 for product framing.

## Layered semantic models feeding the BEG

```
Technical Model (Java Semantic Model + Spring Semantic Model)
        ↓
Business Semantic Model   (packages/business-analyzer)
        ↓
Business Execution Graph  (packages/graph-engine)
```

Keeping the Business Semantic Model as a distinct layer between raw
technical analysis and the BEG is what allows future framework adapters
(.NET, Node, Python, Go, …) to target the same BEG without the graph itself
knowing anything about Spring — see `MASTER_PLAN.md` §14.

## Node concept

A node represents a meaningful business action, decision, transformation,
external interaction, or system boundary — never a raw technical construct
by default. Every node carries **both** business and technical metadata; the
active detail level (business/developer/technical, §6) decides what's shown.

Required node concerns (exact schema TBD in `graph-model.md` as it's
implemented):

- Identity: stable, unique `id`.
- Business metadata: `businessName`, `businessDescription`, `confidence`.
- Technical metadata: `technicalName`, implementation details appropriate
  to the node type.
- Source provenance: `file`, `lineStart`, `lineEnd`, and ideally
  `method`/`class`/`package` — this is what makes graph ↔ source navigation
  possible (`MASTER_PLAN.md` §74).
- `type`: one of the extensible node types in `graph-model.md`.

## Confidence is mandatory, not optional

Business inference is never presented as ground truth. Every inferred
business-level name/description carries a numeric `confidence`, and the UI
must surface low-confidence inferences as "Inferred" / "Low confidence"
rather than asserting them as fact. Do not fabricate certainty — this is a
product integrity requirement, not a nice-to-have (`MASTER_PLAN.md` §12).

## Detail-level projection

Switching between business/developer/technical views is a **projection** of
the same BEG (a read-time transform), never a different generated graph.
`packages/graph-engine` owns this projection logic; `packages/visualization`
only renders what it's given.

## Future extension point: runtime enrichment

Phase 2 (`MASTER_PLAN.md` §37–38) attaches runtime trace data to existing
BEG nodes via `nodeId` rather than creating a second graph model. The domain
model should be designed now so a node can later carry an optional runtime
trace summary without a breaking schema change — see
`docs/adr/ADR-005-graph-schema-versioning.md`.
