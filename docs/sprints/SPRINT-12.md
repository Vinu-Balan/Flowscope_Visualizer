# SPRINT-12: Deeper Business Logic Capture

## Goal

Direct response to: *"When using this app for a complex application with
more function calls, preprocessing, multiple dependent api calls, post
processing with multiple decision control flows, it is not capturing any
of the business logic. It is just providing the very very high level
data in the graph. I want the graph to show everything including even
minute business logic."*

## Investigation

Surveyed all four of the user's real projects for exactly what a
"complex application" looks like in practice: call-chain depth, loops,
streams/lambdas, try/catch, and switch, with concrete file:line evidence
for each. Full findings and ranking are in the investigation record; the
short version —

- **Call chains 3+ hops deep are the norm**, not the exception, in every
  project except the thinnest one. `BookingService.createBooking`
  (BookMyShow) depends on two other services, each with its own
  lookup-or-throw a level deeper; `AnalyzerService.analyze`
  (resume-analyzer) chains a repository lookup, an external ML call, and
  DTO mapping in one method.
- **`try`/`catch` used as real business branching** — not just error
  handling — appears systemically in resume-analyzer (16 catch blocks,
  most implementing a success/failure audit-log branch) and shows up
  directly as an alternate-strategy selector in `AuthService.signin`
  (`catch (InvalidEmailFormatException e)` picks a completely different
  lookup path, not an error at all).
- Loops, streams/lambdas (especially `Optional...orElseThrow(() -> ...)`),
  and `switch` are real but comparatively rarer, concentrated in
  resume-analyzer's file-parsing utilities.

This sprint tackles the two highest-ranked items — chain depth and
try/catch — plus two data-loss bugs the investigation's own verification
work surfaced along the way that turned out to matter just as much in
practice. Loops, general lambda bodies, and `switch` are explicitly
deferred (see below).

## What shipped

### 1. Inlining depth raised from 1 to 8 (`packages/business-analyzer`)

`MAX_INLINE_DEPTH` was 1 — a controller's direct callee got expanded,
nothing past that. Real endpoints routinely chain 3+ hops. Raised to 8,
paired with a new `MAX_TOTAL_STEPS` (150) safety valve so a call graph
that's *wide* rather than deep can't produce an unbounded diagram — once
hit, a call that would otherwise inline just becomes a plain step
instead. `ctx.visited` (unchanged) already prevents infinite recursion on
a real cycle regardless of either number.

### 2. `try`/`catch` modeled as a real branch (`packages/parser-java` + `packages/business-analyzer`)

New `'try'`/`'catch'` body-event kinds, extracted with the same flat,
count-bounded layout `'if'`'s then/else branches already use (`processTry`
in `extract-body-events.ts`), handling both a plain `try` and
`try (Resource r = ...)` (the resource declaration itself isn't modeled;
neither is `finally`). `handleTry` (mirroring `handleIf`) gives the
try-block and every catch clause their own steps, each catch hanging off
the same point the try-block itself connects from via an `'error'`-type
edge labeled with the exception type — there's no natural "decision" step
for a `try` the way an `if`'s condition provides one. A synthetic step
(`describeCatch`) is always added for entering a catch clause, so even a
trivial handler is visible. The same "whichever branch doesn't end the
method is where trailing code resumes from" merge-point rule from
SPRINT-9's if/else applies here too, generalized from 2 branches to N.

### 3. Two data-loss bugs found while verifying #1 and #2 against real code

- **Plain assignment (`user = repo.find(id);`) was silently dropped
  entirely.** `unwrapToPrimary` didn't recognize the CST shape an
  assignment takes (a `binaryExpression` with one `unaryExpression` +
  `AssignmentOperator` + a nested `expression`, rather than two
  `unaryExpression`s) — it unwrapped to the assignment's *target*
  variable instead of its right-hand value, so the real call was never
  even looked at. Found via `AuthService.signin`'s catch clause
  reassigning an already-declared variable — a pattern common enough that
  fixing it changed the shape of several other verified flows too.
- **`return Wrapper.of(service.call(...));` only ever showed the
  wrapper.** A single-expression-body controller method delegating
  straight to a service call wrapped in a response type
  (`return ResponseEntity.ok(bookingService.createBooking(request));`) is
  arguably the single most common real Spring MVC controller shape there
  is — and the nested call was invisible, only `ResponseEntity.ok` itself
  ever extracted. New `returnsNestedCallTarget`/`returnsNestedCallMethod`/
  `returnsNestedCallArgumentCount`/`returnsNestedCallArgumentsText`
  capture a call nested as the returned call's *first* argument;
  `handleReturn`'s depth-0 branch resolves and inlines it exactly like
  any other call, before the outer wrapper step. This alone turned
  `BookingController.createBooking` from 2 rendered steps into 10.

## Verified

Ran `inferBusinessFlow` directly against real endpoints in three
projects, end to end (real parsing, real discovery, real inference — not
hand-built fixtures):

- **`BookingController.createBooking`** (BookMyShow): 2 steps → 10 steps.
  Now shows the seat-lookup chain, a real decision with a reject branch,
  construction, and the save — the whole "preprocessing, dependent
  lookups, decision, postprocessing" shape the user described.
- **`AnalyzeController.analyze`** (resume-analyzer): grew to 22 steps —
  two repository lookups, an access-control decision with its own reject
  branch, the external ML call, DTO mapping (ten `Set X` steps across two
  response objects), the repository save, and the full try/catch
  success/failure audit-logging branch, all previously invisible past the
  first hop.
- **`CommentController.createCommentHandler`** (InstagramClone): only
  modestly deeper (4 steps) — traced why (see "Explicitly deferred"): the
  controller's fields are typed as *interfaces*
  (`private CommentService commentService;`), with the real logic in a
  differently-named implementation class
  (`CommentServiceImplementation`). Call resolution matches by type name,
  so it correctly fails closed (a plain step, not a crash or a silently
  wrong inline) rather than resolving into nothing.

## Explicitly deferred to later sprints

**Interface → implementation resolution** — found while verifying
InstagramClone above, and likely the *next* highest-leverage gap: a
field typed as an interface (`UserService`) whose real logic lives in an
implementation class (`UserServiceImplementation`) can't be inlined at
all today, since `JavaType` doesn't capture `implements`/`extends`
clauses and resolution only matches by declared type name. A real
feature (needs implements-clause extraction plus a strategy for picking
the right implementation when more than one exists), not a quick add.

Loops (`for`/`while`/`do-while`), general lambda bodies (`.stream().map()`,
`.forEach()`), and `switch` — real per the investigation but rarer and
more concentrated (resume-analyzer's file-parsing utilities
specifically) than chain depth and try/catch were. The
`Optional...orElseThrow(() -> new X(...))` "lookup or 404" idiom — the
single most repeated pattern across three of the four projects — is a
lambda-body case specifically worth prioritizing first when this is
picked back up, since it's both extremely common and already close to
today's call-detection machinery (the lookup call itself is already
extracted; only the `orElseThrow`'s not-found branch is missing).

## Acceptance criteria

- [x] A same-project call chain 3+ hops deep inlines correctly, bounded
      by depth and total step count rather than a hardcoded depth of 1.
- [x] A `try`/`catch` produces a real, correctly-labeled branch per catch
      clause, with the same "whichever side doesn't end the method is
      where trailing code resumes" rule as if/else.
- [x] A plain (non-declaring) assignment's right-hand call is extracted,
      not silently dropped.
- [x] A call nested inside a `return`'s outer wrapper call is resolved
      and inlined, not just the wrapper.
- [x] `pnpm typecheck`, `pnpm lint`, and `pnpm test` are all clean (256
      tests, 24 new).
- [x] Verified against three real, previously-thin endpoints across two
      projects, confirming a large, correct increase in captured detail
      (2→10 steps, ~7→22 steps) — not just passing unit tests.

## Status

Complete.
