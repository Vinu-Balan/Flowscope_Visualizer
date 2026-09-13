# @flowscope/shared

Shared contracts and DTOs consumed by more than one layer — e.g. types that
both `apps/desktop`'s renderer and `packages/ipc` need, where the type
itself isn't infrastructure (that's `packages/core`) and isn't the IPC
operation definition itself (that's `packages/ipc`).

Depends only on `packages/core`. Kept deliberately small — prefer putting a
type in the package that owns the concept (e.g. graph types belong in
`packages/graph-schema`) and only promote something here when it's
genuinely needed by multiple otherwise-unrelated packages.

**Status:** not yet implemented — see `docs/sprints/SPRINT-1.md`.
