# @flowscope/config

Centralized configuration and persisted user settings (theme, graph
layout, default detail level, analysis behavior, cache behavior, logging
level, keyboard shortcuts, project exclusions — `MASTER_PLAN.md` §28)
backed by a local configuration store. No component should hard-code a
user preference, path, port, or secret — those flow through this package
(`MASTER_PLAN.md` §76).

**Status:** implemented (SPRINT-1) — theme, recent projects, and logging
level, via `SettingsStore` (atomic JSON persistence, defensive fallback on
a missing/corrupt file). Published as two entry points: `@flowscope/config`
(full barrel incl. `SettingsStore`, Node-only, main-process use) and
`@flowscope/config/settings` (the zod schema alone, safe to import from a
sandboxed context like the preload script) — see the comment atop
`src/settings.ts` for why that split exists. Graph layout, default detail
level, analysis/cache behavior, shortcuts, and exclusions are still just
concepts in the schema, added as later sprints need them.
