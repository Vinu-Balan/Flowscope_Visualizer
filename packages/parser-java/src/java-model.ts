/**
 * A deliberately small Java Semantic Model — see
 * docs/adr/ADR-006-java-parsing-without-a-jvm.md,
 * docs/sprints/SPRINT-4.md, and docs/sprints/SPRINT-5.md. Extracts only
 * what FlowScope currently needs (package name, top-level `class`
 * declarations, their annotations, fields, and methods — each method's
 * body reduced to a flat sequence of notable events) rather than modeling
 * the whole Java grammar. Framework-independent on purpose — nothing here
 * knows about Spring (docs/architecture/domain-model.md).
 */

export interface JavaAnnotation {
  /** Simple name only, e.g. "RequestMapping" — no import resolution (ADR-006). */
  readonly name: string;
  /**
   * String-literal element values, keyed by element name. A bare single
   * value like `@GetMapping("/x")` is normalized under the key "value",
   * matching Java's own rule that an unnamed element refers to `value()`.
   */
  readonly stringArguments: Readonly<Record<string, string>>;
  /**
   * Identifier/enum-constant-reference element values, keyed by element
   * name, each a list of dot-joined references — e.g.
   * `method = RequestMethod.POST` → `{ method: ["RequestMethod.POST"] }`;
   * `method = {RequestMethod.GET, RequestMethod.HEAD}` →
   * `{ method: ["RequestMethod.GET", "RequestMethod.HEAD"] }`.
   */
  readonly identifierArguments: Readonly<Record<string, readonly string[]>>;
}

/**
 * One notable thing a method body does, in source order — a deliberately
 * flat, best-effort extraction (not a control-flow model) feeding
 * `packages/business-analyzer`'s inference. See
 * `docs/sprints/SPRINT-5.md` for exactly what is and isn't extracted.
 */
export type JavaBodyEventKind = 'call' | 'construct' | 'if' | 'throw' | 'return' | 'try' | 'catch';

export interface JavaBodyEvent {
  readonly kind: JavaBodyEventKind;
  readonly line: number;

  /** 'call': the dotted target before the method name, e.g. "customerService"; '' for a bare call. */
  readonly targetName?: string | undefined;
  /** 'call': the invoked method's simple name. 'construct': the constructed type's simple name. */
  readonly methodName?: string | undefined;
  /** 'construct': true when an argument itself looks like an identifier generator (e.g. `UUID.randomUUID()`). */
  readonly looksGenerated?: boolean | undefined;
  /**
   * 'call': a leading string-literal argument, when the call's first
   * argument is a bare string literal or the literal prefix of a
   * `"literal" + expr` concatenation — e.g. `model.addAttribute("username", ...)`
   * → `"username"`. Not resolved for a `static final` constant reference
   * (docs/sprints/SPRINT-7.md's "Explicitly deferred").
   */
  readonly firstStringArgument?: string | undefined;
  /**
   * 'call': how many arguments the call passes — used to disambiguate an
   * overloaded target method by arity when more than one method on the
   * resolved type shares the call's name (docs/sprints/SPRINT-7.md).
   */
  readonly argumentCount?: number | undefined;
  /**
   * 'call'/'construct'/'throw': the argument list exactly as written
   * (e.g. `name, categoryId, price`) — not an evaluation, just the source
   * text, so the Inspector's Technical panel shows which variable or
   * literal is actually passed at that step instead of a placeholder
   * `(...)` (docs/sprints/SPRINT-8.md — "so the developer will know what
   * value causes issues").
   */
  readonly argumentsText?: string | undefined;

  /** 'if': a best-effort human-readable rendering of the condition. */
  readonly conditionText?: string | undefined;
  /** 'if': true when the then-branch's first statement is a `throw`. */
  readonly guardThrows?: boolean | undefined;
  /** 'if': true when the then-branch's first statement is a `return`. */
  readonly guardReturns?: boolean | undefined;
  /**
   * 'if': whether the condition itself resolved to a call, and so pushed
   * its own `'call'` event right after this one. Without this, a
   * consumer can't distinguish "the next event is my condition's own
   * call" from "there was no condition-call event, so the next event is
   * already the then-branch's first statement" — a condition that isn't
   * itself a call (e.g. `!exists`) followed by a then-branch that opens
   * with one (e.g. `user.setRole(...)`) would otherwise have that first
   * then-branch step misread as the condition's call
   * (docs/sprints/SPRINT-9.md).
   */
  readonly hasConditionCall?: boolean | undefined;
  /**
   * 'if': how many of the events immediately following this one (after
   * this condition's own 'call' event, if any) belong to the then-branch —
   * the flat event list has no block boundaries otherwise, so this is how
   * a consumer knows where the branch ends and what comes after the `if`
   * begins. Covers any then-branch, not just a bare throw/return
   * (docs/sprints/SPRINT-8.md).
   */
  readonly thenEventCount?: number | undefined;
  /**
   * 'if': how many of the events after the then-branch's own belong to a
   * real `else` branch — `undefined` when there's no `else` at all
   * (distinct from `0`, an `else` with an empty body). An `else if` chain
   * is just an `elseEventCount`-bounded slice that happens to start with
   * its own nested `'if'` event (docs/sprints/SPRINT-9.md).
   */
  readonly elseEventCount?: number | undefined;

  /**
   * 'throw': the thrown exception's simple type name. 'catch': the caught
   * exception type's simple name from a `catch (X e)` clause — reused
   * rather than a parallel field, since it's the same kind of value. A
   * multi-catch (`catch (IOException | SQLException e)`) reports only the
   * first type (docs/sprints/SPRINT-12.md).
   */
  readonly exceptionType?: string | undefined;
  /** 'throw': the exception message, under the same leading-literal rule as `firstStringArgument`. */
  readonly exceptionMessage?: string | undefined;

  /**
   * 'try': how many of the events immediately following this one belong
   * to the try-block itself, before any 'catch' events begin — same
   * boundary-marking role as `thenEventCount` (docs/sprints/SPRINT-12.md).
   * Covers both a plain `try { }` and `try (Resource r = ...) { }`
   * (try-with-resources — the resource declaration itself isn't modeled,
   * only the block); a `finally` clause isn't modeled at all.
   */
  readonly tryEventCount?: number | undefined;
  /**
   * 'try': how many `'catch'` events (each with its own event-count
   * boundary) immediately follow the try-block's own events — 0 for a
   * `try` with no `catch` at all (try-with-resources used purely for
   * auto-closing).
   */
  readonly catchCount?: number | undefined;
  /** 'catch': how many of the following events belong to this catch clause's own body. */
  readonly catchEventCount?: number | undefined;

  /** 'return': the returned expression's call chain, if any (e.g. targetName "ResponseEntity", methodName "ok"). */
  readonly returnsCallTarget?: string | undefined;
  readonly returnsCallMethod?: string | undefined;
  /** 'return': the returned call's argument list exactly as written — same rule as `argumentsText`. */
  readonly returnsCallArgumentsText?: string | undefined;
  /**
   * 'return': a call nested as the returned call's *first argument* —
   * e.g. `bookingService.createBooking(request)` inside
   * `return ResponseEntity.ok(bookingService.createBooking(request));`.
   * Without this, a single-expression-body controller method (extremely
   * common in real Spring MVC code) has its actual business call
   * completely invisible — only the outer wrapper call
   * (`ResponseEntity.ok`) was ever seen (docs/sprints/SPRINT-12.md).
   * `undefined` when the first argument isn't itself a call.
   */
  readonly returnsNestedCallTarget?: string | undefined;
  readonly returnsNestedCallMethod?: string | undefined;
  /** 'return': the nested call's own argument count — same overload-disambiguation role as `argumentCount`. */
  readonly returnsNestedCallArgumentCount?: number | undefined;
  /** 'return': the nested call's argument list exactly as written — same rule as `argumentsText`. */
  readonly returnsNestedCallArgumentsText?: string | undefined;
  /** 'return': true for a bare `return null;`. */
  readonly returnsNullLiteral?: boolean | undefined;
  /** 'return': the returned string literal, when the return expression is (or starts with) one — typically a view name, e.g. `"redirect:/x"`. */
  readonly returnsStringLiteral?: string | undefined;
  /**
   * 'return': the returned expression's name, when it's nothing but a
   * bare identifier — e.g. `return REDIRECT_ADMIN_PRODUCTS;` → `"REDIRECT_ADMIN_PRODUCTS"`.
   * Could be a local variable, a field, or a `static final` constant;
   * `packages/business-analyzer` resolves it against the owning type's
   * `JavaField.stringConstantValue` when there is one — the classic
   * `private static final String VIEW = "..."` idiom (docs/sprints/SPRINT-7.md).
   */
  readonly returnsIdentifier?: string | undefined;
}

export interface JavaMethod {
  readonly name: string;
  readonly annotations: readonly JavaAnnotation[];
  /** The method declarator's source line. Not a precise start/end range yet — see ADR-006. */
  readonly line: number;
  /**
   * How many formal parameters the method declares (varargs counts as
   * one). Overload resolution has no type information to go on, so this
   * is the only disambiguator available when two methods on the same
   * type share a name — e.g. Spring MVC's common `GET`/`POST`
   * `addProduct()` / `addProduct(...)` pair (docs/sprints/SPRINT-7.md).
   */
  readonly parameterCount: number;
  /** Empty for a method with no body (abstract/interface) or nothing extractable. */
  readonly bodyEvents: readonly JavaBodyEvent[];
}

export type JavaTypeKind = 'class' | 'interface' | 'enum' | 'record';

export interface JavaField {
  readonly name: string;
  /** Simple declared type name only, e.g. "CustomerService" or "Map" for `Map<String, Customer>" — no generic args, no import resolution. */
  readonly type: string;
  /**
   * The field's initializer, when it's a `static final String` assigned a
   * literal (or the literal-leading portion of a concatenation) — e.g.
   * `private static final String VIEW = "productsAdd";`. The common
   * Java idiom of naming a view/redirect target once and returning the
   * constant, rather than a literal directly (docs/sprints/SPRINT-7.md;
   * found in the user's real AdminController). Undefined for every other
   * field, including a non-`static`/non-`final` one of type `String`.
   */
  readonly stringConstantValue?: string | undefined;
}

export interface JavaType {
  readonly name: string;
  readonly kind: JavaTypeKind;
  readonly annotations: readonly JavaAnnotation[];
  /** Only methods declared directly on this type — see ADR-006's nested-type caveat. */
  readonly methods: readonly JavaMethod[];
  /** Only fields declared directly on this type. */
  readonly fields: readonly JavaField[];
  /** The type declaration's source line. */
  readonly line: number;
}

export interface JavaSourceFile {
  /** Empty string for the (unusual) default/unnamed package. */
  readonly packageName: string;
  /** Top-level type declarations only — see ADR-006. */
  readonly types: readonly JavaType[];
}
