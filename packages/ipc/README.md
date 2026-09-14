# @flowscope/ipc

The closed set of named, typed IPC operations shared between the Electron
main process and renderer in `apps/desktop`
(`docs/adr/ADR-004-ipc-boundary.md`): `project.open`, `project.scan`,
`analysis.start`, `analysis.cancel`, `analysis.status`, `graph.load`,
`graph.save`, `source.open`, and any future operation added with the same
discipline. Every operation has an explicit input/output type, validated on
both sides. No generic `execute(command)`-style operation is ever added
here (`MASTER_PLAN.md` §31).

This package is effectively the full renderer-visible capability surface of
FlowScope — review changes to it with the same scrutiny as the preload
script itself.

**Status:** `system.ping`, `project.open`, `project.validate`,
`project.scan`, `project.discoverApis`, `project.inferBusinessFlow`,
`settings.get`, and `settings.update` are implemented (SPRINT-1 through
SPRINT-5), each with a zod request/response schema and validated via
`parseOrThrow` on both the main and preload sides. `analysis.*`,
`graph.*`, and `source.open` land as the sprints that need them
(SPRINT-6 onward).
