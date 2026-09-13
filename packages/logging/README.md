# @flowscope/logging

Centralized, leveled (`debug`/`info`/`warn`/`error`) structured logging for
`apps/desktop` (main + renderer) and, eventually, `apps/parser-engine`
(`MASTER_PLAN.md` §33). No production code path should use a scattered
`console.log` once this package exists — see `docs/CODING_GUIDELINES.md`.

**Never logs**: source code contents, credentials, tokens, secrets, or
personal data — enforced by convention and reviewed at every call site that
logs analysis or project data.

**Status:** implemented (SPRINT-1) — `createLogger`, a console transport
(pretty in dev, JSON in prod), a Node-only file transport (writes to
`<userData>/logs/flowscope.log`, serialized so concurrent writes stay in
order), and metadata redaction. Wired into `apps/desktop`'s main process.
