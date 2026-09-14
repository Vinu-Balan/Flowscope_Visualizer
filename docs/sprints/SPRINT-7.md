# SPRINT-7: Extraction Fidelity & Naming Quality (Weekend 7)

## Goal

Direct response to user feedback on real-world testing (against the
user's own BookMyShow and E-commerce Spring Boot projects, not just the
`simple-customer-service` fixture): the decision diamond was too cramped
to read, and many steps rendered as generic, duplicate, meaningless text
("Add Attribute" repeated for every `model.addAttribute(...)` call,
"Return" for every view-name return). Investigating against the user's
real projects surfaced the actual root causes — not just naming
weaknesses, but a real extraction bug that silently dropped a very common
call shape entirely.

This sprint doesn't map onto one of `docs/ROADMAP.md`'s ten weekends by
name — it's a correction/hardening pass the roadmap's fixture-driven
Sprints 5–6 didn't anticipate needing, justified directly by testing
against real, external code rather than only the one small fixture
`packages/business-analyzer`'s tests have exercised so far. It's a
prerequisite for Weekend 7's Inspector work being worth doing at all: an
Inspector polished around generic, duplicate text wouldn't be valuable.

A second round of feedback arrived mid-sprint, after the fixes below were
already built and tested but before the sprint was verified end-to-end in
the real app: *"Make the technical section after clicking the node more
detailed. Add more steps in the flow diagram to show the entire execution
so that it will be easy for the developers to completely understand
without seeing the actual codebase."* Investigating that — by launching
the real app against the real E-commerce project and reading the actual
`AdminController.addProduct` source — surfaced something more serious
than a missing-detail gap: the rendered flow for `POST
/admin/products/add` was showing the wrong method's body entirely (see
"A second investigation" below). That finding drove most of this sprint's
second half.

## Investigation

Reading the user's real projects directly (`D:\SpringBootApplications\BookMyShow`,
`D:\SpringBootApplications\E-commerce-project-springBoot`) surfaced three
real gaps `simple-customer-service` never exercised:

1. **A real extraction bug, not just a naming weakness**: `this.field.method(...)` —
   an extremely common style (see `AdminController` in the E-commerce
   fixture) — parses with `primaryPrefix = This`, not `fqnOrRefType`.
   `describeCallAtPrimary` only ever recognized the `fqnOrRefType` shape,
   so every explicitly-`this`-qualified call was silently dropped from
   the flow entirely — not mis-named, just invisible.
2. **The builder pattern isn't recognized as construction.**
   `User.builder().name(n).email(e).build()` (ubiquitous with Lombok) hits
   the *first* call in the chain (`.builder()`) under the old
   single-call-per-primary detection, producing a step literally named
   "Builder" — worse than generic, actively confusing.
3. **String-literal arguments and return values carry real information
   the old extraction discarded.** `model.addAttribute("username", ...)`
   and `return "redirect:categories";` are exactly the "same text in
   every node" the user flagged — the method/return shape is identical
   across many call sites, and only the string argument distinguishes
   them.

## A second investigation: the wrong method entirely

Launching the built app against `E-commerce-project-springBoot` and
selecting `POST /admin/products/add` rendered a plausible-looking but
*wrong* 5-step flow (`Create Admin` → `Create ModelAndView` → `Get
Categories` → `Prepare Admin Data for Display` → `Return Response`).
Reading `AdminController.java` line by line revealed why:
`AdminController` declares **two overloaded `addProduct` methods** — a
`@GetMapping` one (`ModelAndView addProduct()`, shows the add-product
form) and a `@PostMapping` one (`String addProduct(@RequestParam ...)`,
does the actual add). `inferBusinessFlow`'s entry-point lookup
(`entryType.methods.find((m) => m.name === api.methodName)`) matched by
name only and always took whichever overload was declared first — so
selecting the POST endpoint silently analyzed the GET method's body
instead. This fully explained both the "only 5 generic steps" symptom and
the user's "add more steps" ask: the flow wasn't incomplete, it was for
the wrong method.

The same name-only lookup existed in `resolveCall`, used when inlining a
same-project callee — so an overloaded *service* method (less common, but
not rare) would have hit the identical bug one level down.

Fixing this exposed two further gaps in the same real method once the
right body was actually being read:

4. **A private same-class helper method, called bare (no `this.`/field
   target), was never inlined.** `AdminController.addProduct(POST)` calls
   `buildProduct(name, categoryId, ...)` — a private helper on the same
   class — to construct the `Product` via `new Product()` plus seven
   `product.setXxx(...)` calls. A bare call *is* handled by `resolveCall`'s
   self-call branch (`targetName === ''` resolves against the owning
   type itself), so once the entry-point bug was fixed this started
   working — but it surfaced that overload resolution needed a real fix
   inside `resolveCall` too, not just at the entry point (see below).
5. **`return SOME_CONSTANT;` where `SOME_CONSTANT` is a `private static
   final String` field on the same class** — the exact
   `REDIRECT_ADMIN_PRODUCTS = "redirect:/admin/products"` idiom flagged as
   deferred in the first investigation — still fell through to a generic
   "Return Response", because nothing captured field *initializer*
   values, only field names/types.

## Architecture touched

- `packages/parser-java`: `describeCallAtPrimary` rewritten to walk the
  `primarySuffix` chain generally (accumulating dotted identifiers from
  *either* a `fqnOrRefType` base *or* an empty base after `this`/other
  prefixes) instead of requiring everything pre-folded into
  `fqnOrRefType`. New `isBuilderChain` detection folds a
  `X.builder()...build()` chain into a `'construct'` event. `JavaBodyEvent`
  gains `firstStringArgument` (call), `returnsStringLiteral` (return),
  and `exceptionMessage` (throw) — extracted via a shared
  leading-string-literal helper that also handles the common
  `"prefix: " + variable` concatenation shape (leading literal only, not
  full string evaluation).
- `packages/business-analyzer`: `describeCall` takes an optional
  `firstStringArgument` and uses it — both in a new dedicated
  `addAttribute`/`addObject`/`setXxx` handling and, for any method
  matching no pattern, appended to the fallback name so two different
  calls to the same unrecognized method no longer render as identical
  text. New `describeViewReturn` for string-literal return values
  (`redirect:`/`forward:`/plain view names → "Redirect to X" / "Show X
  Page"). `describeThrow` takes an optional exception message and folds
  it into the description.
- `packages/visualization`: decision nodes no longer render as a diamond
  (`NODE_SHAPE.decision`) — replaced with a shape with real usable text
  width.
- `packages/parser-java` (overload resolution, second pass): `JavaMethod`
  gains `parameterCount` (arity, computed from the method declarator's
  `formalParameterList`, varargs counting as one) — the only
  disambiguator available with no type information. `JavaBodyEvent` gains
  `argumentCount` on `'call'` events (from the call's own `argumentList`)
  and `returnsIdentifier` on `'return'` events (a bare-identifier return
  expression, e.g. `return SOME_CONSTANT;`, distinct from a call-valued or
  string-literal-valued return). `JavaField` gains `stringConstantValue`,
  populated only for a `static final String` field whose initializer is a
  literal (or the literal-leading portion of a concatenation) — reusing
  the same `leadingStringLiteral` helper the first investigation added,
  now exported and shared between body-event extraction and field
  extraction.
- `packages/business-analyzer`: `resolveCall` now filters same-named
  candidates and picks the one whose `parameterCount` matches the call's
  `argumentCount` (`selectOverload`), falling back to the first candidate
  when the argument count isn't known (a return-expression call, or a
  hand-built `DiscoveredApi` in a test) — same fix applied to
  `inferBusinessFlow`'s entry-point lookup, matched by declaration
  `line` (captured from the exact annotated method at discovery time)
  with a name-only fallback for callers that don't have precise line
  info. `handleReturn` resolves a `returnsIdentifier` against the owning
  type's fields for a `stringConstantValue` before falling back to a
  generic response description.
- `apps/desktop`: the node-detail panel's Technical section is now a
  labeled table (Call/Class/Method/Location/Node type/Node ID, each only
  rendered when known) instead of one unlabeled line, and gains a new
  Flow section listing the node's incoming and outgoing edges by the
  connected step's business name and edge label (Yes/No, success/error) —
  resolved from the same graph the canvas renders, so it can't drift from
  what's drawn.

## Planned scope

- The `this.field.method(...)` fix and the general suffix-chain rewrite
  apply uniformly everywhere `describeCallAtPrimary` is used (statement
  calls, local-variable-declaration initializers, `if` conditions, and
  call-valued `return`s) — one fix point, no special-casing per call
  site.
- String-literal capture is deliberately narrow: a bare string literal,
  or the literal prefix of a `literal + expr` concatenation. Reference to
  a `static final String` constant (e.g. `REDIRECT_ADMIN_PRODUCTS`) is
  **not** resolved to its value — that requires a project-wide constant
  index, deferred (see below). Where the literal isn't resolvable, output
  falls back to exactly today's behavior — never worse, just not always
  improved.
- Builder-chain detection requires the base identifier chain's last
  segment to match `/^builder$/i` *and* the suffix chain to actually
  reach a trailing `.build()` call — a `Foo.builder()` used for anything
  else (rare) safely falls through to ordinary call handling instead of
  misfiring.

## Explicitly deferred to later sprints

Resolving `mv.addObject(SOME_CONSTANT, x)` — a constant used as a call
*argument* rather than a bare `return` value — is still not resolved;
only the `return SOME_CONSTANT;` shape was fixed, since that was the
shape the real bug report needed. Resolving a constant declared on a
*different* class (only same-class fields are checked). Tracking a local
variable's constructor back through `return mv;` when `mv` was built
several statements earlier (needs local dataflow tracking within a
method). Lambda-body extraction (`orElseThrow(() -> ...)` and similar) —
still out of scope per Sprint 5. Loops, switch, try/catch — still
unmodeled; not needed for the specific real methods this sprint's
investigation covered, but still a real gap for any method that uses
them. Overload resolution by argument *count* only, not type — two
overloads with the same arity are still indistinguishable (arity is the
only signal available without a type checker). The Inspector's remaining
UI work (multi-level switching, source navigation) stays Weekend 7/8
proper, next.

## Acceptance criteria

- [x] A `this.field.method(...)` call is extracted and produces a step —
      verified against a real pattern from `AdminController.java`
      (E-commerce fixture project), not just a hand-built snippet.
- [x] `X.builder()...build()` produces a `'construct'` step named after
      the built type, not a generic "Builder" step.
- [x] Two different `model.addAttribute("key1", ...)` /
      `model.addAttribute("key2", ...)` calls produce two distinctly-worded
      steps, not identical text.
- [x] `return "redirect:categories";` and `return "index";` produce
      distinctly-worded, real steps ("Redirect to Categories" / "Show
      Index Page"), not both "Return Response".
- [x] Decision nodes render in a shape with visibly more usable text
      width than Sprint 6's diamond, verified in the actual built app.
- [x] Two overloaded handler methods sharing a name (e.g. a form-showing
      `GET addProduct()` and a form-submitting `POST addProduct(...)`)
      each analyze their *own* body — verified with a real,
      previously-broken endpoint (`POST /admin/products/add`), not just a
      hand-built snippet.
- [x] A bare self-call to a private same-class helper method is inlined.
- [x] `return SOME_CONSTANT;` where `SOME_CONSTANT` is a same-class
      `private static final String` resolves to the constant's literal
      value, not a generic response.
- [x] The node-detail panel's Technical section shows labeled call/class/
      method/location detail, and a new Flow section shows what leads
      into and out of the selected node.
- [x] `pnpm typecheck`, `pnpm lint`, and `pnpm test` are all clean (237
      tests, 34 of them new this sprint).
- [x] Verified by launching the actual built app against the user's real
      E-commerce project and the `simple-customer-service` fixture,
      including running `inferBusinessFlow` directly against every file
      in the real project's `AdminController`/`ProductService` package to
      confirm the exact fixed step sequence end to end (`Create Admin` →
      `Get Category` → `Create Product` → seven `Set X` steps → `Add
      Product` → `Redirect to Admin Products`) — not just a hand-built
      snippet.

## Status

Complete.
