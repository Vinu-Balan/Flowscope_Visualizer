/**
 * A deliberately small Java Semantic Model — see
 * docs/adr/ADR-006-java-parsing-without-a-jvm.md and
 * docs/sprints/SPRINT-4.md. Extracts only what FlowScope currently needs
 * (package name, top-level `class` declarations, their annotations and
 * methods) rather than modeling the whole Java grammar. Framework-
 * independent on purpose — nothing here knows about Spring
 * (docs/architecture/domain-model.md).
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

export interface JavaMethod {
  readonly name: string;
  readonly annotations: readonly JavaAnnotation[];
  /** The method declarator's source line. Not a precise start/end range yet — see ADR-006. */
  readonly line: number;
}

export type JavaTypeKind = 'class' | 'interface' | 'enum' | 'record';

export interface JavaType {
  readonly name: string;
  readonly kind: JavaTypeKind;
  readonly annotations: readonly JavaAnnotation[];
  /** Only methods declared directly on this type — see ADR-006's nested-type caveat. */
  readonly methods: readonly JavaMethod[];
  /** The type declaration's source line. */
  readonly line: number;
}

export interface JavaSourceFile {
  /** Empty string for the (unusual) default/unnamed package. */
  readonly packageName: string;
  /** Top-level type declarations only — see ADR-006. */
  readonly types: readonly JavaType[];
}
