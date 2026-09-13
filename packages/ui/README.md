# @flowscope/ui

Shared React component library — FlowScope's design system. Built on
Radix UI primitives + Tailwind CSS, animated sparingly with Framer Motion,
following the dark-first, premium/minimal/information-dense visual language
in `MASTER_PLAN.md` §20, §65–66 (VS Code / IntelliJ / Linear / Raycast /
Figma inspired, never copied verbatim).

Contains presentation components only — no business logic, no direct IPC
calls (`docs/CODING_GUIDELINES.md`). Consumed by `apps/desktop`.

**Status:** implemented (SPRINT-1) — `Button`, `Tooltip`, `Tabs`, `Dialog`,
`ScrollArea`, `Separator`, `EmptyState`, `Kbd`, `StatusBarItem`, and a
Zustand-backed `Toast`/`Toaster`. Grows as later sprints need new
primitives (e.g. a graph legend, a confidence badge).
