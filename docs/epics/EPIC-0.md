# EPIC-0: Repository & Architecture Foundation

## Goal

Establish the monorepo structure, tooling, and architecture documentation
FlowScope's implementation will build against — before any product code is
written, so every subsequent sprint has a consistent, documented foundation
to build on (`MASTER_PLAN.md` §54–56).

## Scope

- pnpm monorepo: `apps/{desktop,parser-engine}`, all 15 `packages/*`
  (`docs/ARCHITECTURE.md`), `docs/`, `scripts/`, `tests/`.
- Root tooling: strict TypeScript base config, ESLint (flat config, TS
  strict, no `any`), Prettier, Vitest workspace wiring.
- Foundational docs: `MASTER_PLAN.md`, `ARCHITECTURE.md`, `ROADMAP.md`,
  `CODING_GUIDELINES.md`, `docs/architecture/*`, `docs/adr/ADR-001..005`.
- Git repository initialized with a clean history from the start.

## Explicitly out of scope for this epic

Any application code (Electron shell, React UI, Rust engine, parser
adapters, graph engine implementation). That begins in EPIC-1 / SPRINT-1.

## Acceptance criteria

- [x] `pnpm-workspace.yaml` + root `package.json` define a valid workspace.
- [x] Every `apps/*` and `packages/*` directory exists with an identifying
      `package.json` (or `Cargo.toml` for the Rust app) and a README stating
      its single responsibility, matching `docs/ARCHITECTURE.md`.
- [x] `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`,
      `vitest.workspace.ts` exist and reflect the strict-TS / no-`any`
      rules from `MASTER_PLAN.md` §9, §86.
- [x] `docs/MASTER_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`,
      `docs/CODING_GUIDELINES.md` exist.
- [x] `docs/architecture/system-architecture.md`, `domain-model.md`,
      `analysis-pipeline.md`, `graph-model.md`, and `security-architecture.md`
      all exist.
- [x] `docs/adr/ADR-001` through `ADR-005` exist, covering the monorepo
      structure, the BEG-as-canonical-model decision, the Electron
      architecture, the IPC boundary, and graph schema versioning.
- [x] `pnpm install`, `pnpm lint`, `pnpm exec tsc --noEmit`, and
      `pnpm format` all run cleanly against the scaffold.

## Status

Complete. Repository scaffolding, tooling, and architecture documentation
are in place and verified. Real implementation begins in
`docs/sprints/SPRINT-1.md`.
