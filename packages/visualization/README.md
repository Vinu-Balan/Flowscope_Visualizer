# @flowscope/visualization

The graph rendering layer: renders a BEG (as projected by
`packages/graph-engine`) using Cytoscape.js for interaction (zoom, pan,
selection, highlighting) and ELK.js for automatic layout
(`MASTER_PLAN.md` §24). Graph positions are always computed, never
hard-coded.

Receives a graph model and detail level; has no knowledge of Spring, Java,
or IPC. Consumed by `apps/desktop`.

**Status:** not yet implemented — see `docs/sprints/SPRINT-1.md` /
`docs/sprints/` Weekend 6 (graph visualization).
