# @flowscope/config

Centralized configuration and persisted user settings (theme, graph
layout, default detail level, analysis behavior, cache behavior, logging
level, keyboard shortcuts, project exclusions — `MASTER_PLAN.md` §28)
backed by a local configuration store. No component should hard-code a
user preference, path, port, or secret — those flow through this package
(`MASTER_PLAN.md` §76).

**Status:** not yet implemented — first real usage (theme setting) lands in
`docs/sprints/SPRINT-1.md`.
