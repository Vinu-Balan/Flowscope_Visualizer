# SPRINT-9: If/Else Branch Coverage

## Goal

Direct response to: *"proceed with the next sprint. Also make sure all
the decision control flows (all conditional statements) are covered in
the branch representation."* SPRINT-8 fixed a decision with no `else`
(a guard clause, or a side effect that falls through); this sprint covers
the other half — a real `if`/`else`, previously silently dropped
entirely (the `else` statement was never read at all, per ADR-006's
generic-accessor style using only the first `statement` child).

Like SPRINT-7/8, this doesn't map onto one of `docs/ROADMAP.md`'s ten
weekends by name — another real-world hardening pass.

## Investigation: what's actually out there

Before building anything, surveyed both of the user's real projects
(`E-commerce-project-springBoot`, `BookMyShow`) for every conditional
construct, to scope this by actual evidence rather than guesswork:

| Construct | Count | Where |
|---|---|---|
| `if`/`else` (real else) | 6 | All in E-commerce; `UserController`/`AdminController` — genuine two-outcome business decisions (registration exists/doesn't, null-user handling, empty-list handling) |
| Guard-clause `if` (no else) | frequent | Already covered (SPRINT-8) — BookMyShow uses almost exclusively this shape |
| Ternary (`a ? b : c`) | 2 | Password-encoding check, role mapping — both as a sub-expression of an assignment/call argument, not a standalone statement |
| `switch` | 0 | Not present anywhere in either project |
| `try`/`catch` | 2 | One real (service-layer exception translation), one DAO boilerplate |
| Loops (`for`/`while`) | 1 | A single validation loop in BookMyShow |

`if`/`else` is the dominant, highest-value construct by a wide margin —
this sprint's scope. `switch` has zero evidence to justify building
against; `try`/`catch` and loops are rare and, where present, mostly
boilerplate rather than business-decision branch points. Ternary is a
real but architecturally different case (an expression embedded inside
another statement, not a statement of its own) — deferred, see below.

## Architecture touched

- `packages/parser-java`: `processIf` now reads `ifStatement.children.statement[1]`
  (present only when an `Else` token exists) as a real else-branch,
  extracting its own events into a scratch array exactly like the
  then-branch, and recording their count as the new `JavaBodyEvent.elseEventCount`
  (`undefined` when there's no `else` at all — distinct from `0`, an
  empty `else {}`). An `else if` chain needs no special handling: the
  else-branch is itself a nested `ifStatement`, so recursing into
  `processIf` composes naturally.
- `packages/business-analyzer`: `handleIf` now builds both branches off
  the decision when `elseEventCount` is present, each walking its own
  events through the shared `processEventAt` dispatcher (SPRINT-8). What
  follows the whole `if`/`else` resumes from whichever branch's last
  event *isn't* a `throw`/`return` (a plain single-cursor model can't
  represent two branches merging back into shared code, so when both
  branches happen to fall through — unusual — the `else` branch's tail
  wins, consistently and documented in code). When both branches end in
  `throw`/`return`, nothing resumes — correctly representing a fully
  exhaustive if/else.
- `packages/visualization`: no changes needed — `'conditional'`-type
  edges (from SPRINT-8) already render both branches distinctly from
  the red/green exit/continue colors.

## A second bug, found while verifying the first fix

Testing against the real `UserController.addUser` registration pattern
(`if (!exists) { user.setRole(...); ...; return ...; } else {...}`)
surfaced a second, unrelated bug: `handleIf`'s detection of "does the
condition itself resolve to a call" used to just check whether
`events[next]` (the event right after the `'if'` event) was call-shaped.
That's wrong whenever the condition *isn't* a call (`!exists` is a
negation, not a call — no condition-call event gets pushed at all) and
the then-branch's first statement *is* one (`user.setRole(...)`): the
then-branch's own first step was silently misread as the condition's
call, corrupting the decision's name *and* throwing off the then-branch
boundary by one event, spilling into the else-branch. Fixed with a new
`JavaBodyEvent.hasConditionCall` flag, computed once in `processIf`
using the exact same logic `emitExpressionEvent` uses to decide whether
to push a condition-call event, so the two can never disagree.

## Explicitly deferred to later sprints

Ternary expressions (`a ? b : c`) — real, but embedded inside another
statement (an assignment, a call argument) rather than being a statement
of its own; representing it as a two-outcome decision means restructuring
how the *containing* statement is modeled, a bigger and architecturally
different change than if/else was. `switch`, `try`/`catch`, loops — no
real evidence in either project to justify the scope right now (see the
survey table above); revisit if a future real project shows the need.
Merge-point modeling generally — still the same single-cursor limitation
as SPRINT-8, just now also applying to real else branches.

## Acceptance criteria

- [x] A real `if`/`else` produces two edges off the decision, each with
      its own branch's real steps — verified against the real
      `UserController.addUser` registration pattern (both branches
      return) and `AdminController.profileDisplay` (both branches fall
      through to shared trailing code).
- [x] Trailing code after an if/else resumes from exactly one branch's
      tail (whichever doesn't end the method), never duplicated onto
      both branches and never left dangling off the decision.
- [x] An `else if` chain is handled through the same recursion, no
      special-casing.
- [x] The `hasConditionCall` bug is fixed: a non-call condition followed
      by a then-branch that opens with a call no longer corrupts the
      decision's name or the branch boundary.
- [x] `pnpm typecheck`, `pnpm lint`, and `pnpm test` are all clean (241
      tests).
- [x] Verified against the real E-commerce project by running
      `inferBusinessFlow` directly against `AdminController.profileDisplay`
      end to end, confirming both branches, correct labels, and the
      correct trailing-step resumption.

## Status

Complete.
