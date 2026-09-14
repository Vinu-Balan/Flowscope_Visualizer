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
export type JavaBodyEventKind = 'call' | 'construct' | 'if' | 'throw' | 'return';

export interface JavaBodyEvent {
  readonly kind: JavaBodyEventKind;
  readonly line: number;

  /** 'call': the dotted target before the method name, e.g. "customerService"; '' for a bare call. */
  readonly targetName?: string | undefined;
  /** 'call': the invoked method's simple name. 'construct': the constructed type's simple name. */
  readonly methodName?: string | undefined;
  /** 'construct': true when an argument itself looks like an identifier generator (e.g. `UUID.randomUUID()`). */
  readonly looksGenerated?: boolean | undefined;

  /** 'if': a best-effort human-readable rendering of the condition. */
  readonly conditionText?: string | undefined;
  /** 'if': true when the then-branch's first statement is a `throw`. */
  readonly guardThrows?: boolean | undefined;
  /** 'if': true when the then-branch's first statement is a `return`. */
  readonly guardReturns?: boolean | undefined;

  /** 'throw': the thrown exception's simple type name. */
  readonly exceptionType?: string | undefined;

  /** 'return': the returned expression's call chain, if any (e.g. targetName "ResponseEntity", methodName "ok"). */
  readonly returnsCallTarget?: string | undefined;
  readonly returnsCallMethod?: string | undefined;
  /** 'return': true for a bare `return null;`. */
  readonly returnsNullLiteral?: boolean | undefined;
}

export interface JavaMethod {
  readonly name: string;
  readonly annotations: readonly JavaAnnotation[];
  /** The method declarator's source line. Not a precise start/end range yet — see ADR-006. */
  readonly line: number;
  /** Empty for a method with no body (abstract/interface) or nothing extractable. */
  readonly bodyEvents: readonly JavaBodyEvent[];
}

export type JavaTypeKind = 'class' | 'interface' | 'enum' | 'record';

export interface JavaField {
  readonly name: string;
  /** Simple declared type name only, e.g. "CustomerService" or "Map" for `Map<String, Customer>" — no generic args, no import resolution. */
  readonly type: string;
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
