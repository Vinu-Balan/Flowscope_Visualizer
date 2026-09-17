# SPRINT-13: Full-Depth Debugging Capture

## Goal

Direct response to: *"This application will be used for debugging the
code. So keep in mind to include all the business logic with the most
possible depth to explore using the code in the given repo. I see most
of the nodes end without any meaning. Make sure the flow goes all the way
into the code and gives a 1:1 mapping of what happens in the code. You
can leave out the logs, imports and focus on the business logics, api
requests etc."*

## Investigation

Traced "nodes end without any meaning" to a specific, previously
undiscovered root cause: `packages/parser-java` never parsed `interface`
declarations at all — only `normalClassDeclaration` was visited, so an
`interface` was silently skipped, like an enum or record. Since Spring's
standard service-layer convention is an interface (`CommentService`) with
a differently-named implementation class (`CommentServiceImplementation`),
every field typed as a service interface — extremely common in real code —
failed to resolve entirely, and `resolveCall` fell back to a plain,
un-inlined step. This is the same gap SPRINT-12 flagged as its highest-
priority deferred item after finding it in InstagramClone; this sprint
closes it.

A second, independent source of "meaningless" nodes: a logger call
(`log.info(...)`, `logger.debug(...)`) or diagnostic print
(`System.out.println(...)`) has no field in `ownerType.fields` to resolve
against (Lombok's `@Slf4j` synthesizes the `log` field at compile time, so
it never appears in parsed source at all), so it fell back to
`describeCall`'s generic fallback — a step literally named "Info" or
"Error" with no real content. Matches the user's own explicit ask to
leave logs out.

A survey of real loop/switch usage across all four of the user's projects
(previously entirely unmodeled — `docs/sprints/SPRINT-9.md`/`SPRINT-12.md`'s
"Explicitly deferred") found:

- **Enhanced `for`-each loops are common and directly relevant to real
  business logic** — e.g. BookMyShow's `BookingService.createBooking`
  loops over requested seat IDs checking each against an already-booked
  set (a real per-item decision), and resume-analyzer's service layer
  uses them repeatedly for DTO-list mapping.
- **Classic `case X: ... break;` switch *statements* have zero
  occurrences** in any of the four projects.
- **A modern arrow-style `switch` *expression*** (`switch (x) { case "a" ->
  ...; }`, used as an initializer, not a statement) does appear — twice,
  in `ResumeController`/`JdController`, both picking a `MediaType` for a
  file download response. Structurally a different CST shape from the
  classic statement form (an expression nested in a variable declarator,
  not a top-level statement) and low business value (a content-type
  lookup, not domain logic) — noted below as deferred rather than chased.

## What shipped

### 1. Interface → implementation resolution (`packages/parser-java` + `packages/business-analyzer`)

- `parseJavaFile` now visits `interfaceDeclaration` (new `interfaceMethodDeclaration`
  override mirrors `methodDeclaration` — an abstract method naturally gets
  `bodyEvents: []` since its `methodBody` has no `block` child; a
  `default`/`static` interface method's real body is extracted like any
  other). `JavaType` gains `extendsType` (a class's single superclass) and
  `implementsTypes` (a class's `implements` list, or an interface's own
  possibly-multiple `extends` list — the same field serves both, since
  both answer "what supertype(s) does this type declare").
- `packages/business-analyzer`'s `buildTypeIndex` now also returns
  `implementorsByInterfaceName`, a reverse index. `resolveCall` redirects
  through it whenever a field's declared type is an interface: one
  implementation resolves unambiguously; more than one prefers the
  shortest name starting with the interface's own name (the
  `<Interface>Impl`/`<Interface>Implementation` convention,
  `pickImplementation` in `type-index.ts`); zero implementations in the
  project correctly falls back to a plain step, not a silent gap.
- `domainNounFromType` now strips its suffix pattern *repeatedly*, not
  once — a resolved `CommentServiceImplementation` (interface `Comment
  Service` redirected to its impl) previously stripped only
  `Implementation`, leaving "CommentService"; now strips all the way to
  "Comment".

### 2. Diagnostic logging left out entirely (`packages/business-analyzer`)

`isLoggingCall` skips a call outright — no step at all — when its target
is `System.out`/`System.err`, or when it's a recognized logging method
(`trace`/`debug`/`info`/`warn`/`error`/`fatal`/`isXEnabled`) called on
either a field declared `Logger`/`Log`, or one of the conventional bare
variable names (`log`/`logger`/`LOG`/`LOGGER`) a logger is given even
when Lombok synthesizes it with no declared field to check against.

### 3. Loops modeled — walked once, framed as "for each"/"repeat" (`packages/parser-java` + `packages/business-analyzer`)

New `'loop'` body-event kind covers an enhanced `for`, a basic `for`, a
`while`, and a `do`/`while` alike (`processForStatement`/
`processWhileStatement`/`processDoStatement` in `extract-body-events.ts`),
each walking the loop body exactly once via the ordinary `processStatement`
— a static flow diagram can't honestly represent "N times" any more
precisely than that. `handleLoop` connects the body sequentially from a
new loop-entry step via a `'loop'`-type edge (`BegEdgeType` already had
this — first thing to actually use it); trailing code resumes from the
body's own tail, no merge-point logic needed since a loop never diverges.
An enhanced `for`'s per-item variable type names the step ("For Each
Comment"); a basic `for`/`while`/`do-while`, or a scalar per-item type
(`Long`/`String`/etc. — found via BookMyShow's `for (Long seatId : ...)`),
falls back to a plain "Repeat", still showing the loop's real header text
in the Technical panel either way.

### 4. `switch` modeled as an N-way branch (`packages/parser-java` + `packages/business-analyzer`)

New `'switch'`/`'case'` body-event kinds cover the classic `case X:
...; break;`/`default:` statement form (`processSwitch`), the same flat,
count-bounded per-branch layout `'try'` uses for catch clauses, extended
from N exception types to N case labels. `handleSwitch` gives the
switched expression its own entry step and each case (`default` included)
its own steps hanging directly off that entry via a `'conditional'` edge
labeled with the case value; the same "whichever branch doesn't end the
method is where trailing code resumes from" merge-point rule applies. An
empty case body (pure fallthrough, no `break`) is simply a zero-length
case — not specially chained into the next one.

## Verified

Ran `inferBusinessFlow` directly against real endpoints, end to end (real
parsing, discovery, inference):

- **`CommentController.createCommentHandler`** (InstagramClone): **4 → 32
  steps**, purely from interface resolution (`CommentService` →
  `CommentServiceImplementation`) — now shows the full JWT-claims parse,
  user/post lookups each with their own reject-branch decision, DTO
  construction, and both repository saves that were previously entirely
  invisible behind the unresolved interface field.
- **`BookingController.createBooking`** (BookMyShow): **10 → 13 steps**
  (10 was SPRINT-12's already-verified number for this same endpoint) —
  the new loop feature surfaces
  the per-seat already-booked check (`for (Long seatId :
  request.getSeatIds())` → `alreadyBookedSeats.contains(seatId)` → reject)
  that was previously invisible.
- **`AnalyzeController.analyze`** (resume-analyzer): unchanged at 22 steps
  for this specific endpoint (it has no loop/switch/interface-field gap of
  its own), confirming the new machinery doesn't regress a flow that was
  already fully captured.

## Explicitly deferred to later sprints

**General lambda bodies**, most valuably `Optional...orElseThrow(() -> new
X(...))` — the classic "lookup or 404" idiom. Confirmed real and common:
**19 occurrences across 12 files** in the user's four projects (e.g. every
`repository.findById(id).orElseThrow(() -> new NotFoundException(...))`
in BookMyShow and resume-analyzer). Today the lookup half
(`repository.findById(id)`) is already visible as its own step; the
`orElseThrow`'s reject branch is invisible. Needs its own CST work (a
call-chain step whose *second* call is `orElseThrow` with a
zero-argument-lambda argument) and its own decision/error-branch modeling
— a real feature on the same scale as this sprint's loop/switch work, not
a quick add, so it's next rather than rushed here.

**Arrow-style `switch` *expressions*** (`switch (x) { case "a" -> ...; }`,
used as a value, not a statement) — confirmed real (2 occurrences, both
low-business-value MIME-type lookups) but a structurally different CST
shape from the classic statement form this sprint models; not modeled.

**General `.stream()`/`.map()`/`.forEach(lambda)` bodies** and a `finally`
clause remain unmodeled, same as before.

## Acceptance criteria

- [x] A field typed as a service interface resolves to its real
      implementation and inlines through it, not a dead end.
- [x] A logger call or console print produces zero steps.
- [x] An enhanced `for`, basic `for`, `while`, and `do`-`while` each
      produce a real step, with the body walked once and trailing code
      correctly resuming after it.
- [x] A classic `switch` produces a real N-way branch, one step per case
      (including `default`), each on its own correctly labeled edge.
- [x] `pnpm typecheck`, `pnpm lint`, and `pnpm test` are all clean (275
      tests, 19 new).
- [x] Verified against real, previously-thin endpoints, confirming a
      large, correct increase in captured detail where the gap existed
      (4 → 32 steps) and no regression where it didn't.

## Status

Complete.
