import { ParserError, err, ok, type Result } from '@flowscope/core';
import {
  BaseJavaCstVisitorWithDefaults,
  parse,
  type ClassDeclarationCtx,
  type FieldDeclarationCtx,
  type InterfaceDeclarationCtx,
  type InterfaceMethodDeclarationCtx,
  type MethodDeclarationCtx,
  type PackageDeclarationCtx,
} from 'java-parser';
import { childNode, childNodes, findFirstToken, hasChild } from './cst-utils';
import { extractAnnotationsFromModifiers } from './extract-annotation';
import { extractBodyEvents, leadingStringLiteral } from './extract-body-events';
import type { JavaAnnotation, JavaField, JavaMethod, JavaSourceFile, JavaType } from './java-model';

/**
 * `java-parser` (as pinned — see ADR-006) doesn't reliably recognize a
 * `record` declared *inside* another class body as a record declaration —
 * it falls back to parsing `record Inner(...) {}` as an ordinary method,
 * with a CST shape that varies by surrounding context (observed both as a
 * "return type" of the literal identifier `record`, and as no usable
 * signal at all in the method's own ctx). Rather than chase every shape
 * the misparse can take, we take a more robust approach: scan the raw
 * source text once for `record <Name>(` declarations and treat any
 * "method" whose name matches one of those as this same misparse, not a
 * real method.
 */
const NESTED_RECORD_DECLARATION_PATTERN = /\brecord\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;

/**
 * Counts a method declarator's formal parameters (a trailing varargs
 * parameter counts as one), for disambiguating same-named overloads by
 * arity — no type information is available to do it any other way (see
 * `JavaMethod.parameterCount`, docs/sprints/SPRINT-7.md).
 */
function parameterCountOf(declarator: unknown): number {
  const list = childNode(declarator, 'formalParameterList');
  if (!list) {
    return 0;
  }
  const fixed = childNodes(list, 'formalParameter').length;
  const varargs = childNode(list, 'lastFormalParameter') ? 1 : 0;
  return fixed + varargs;
}

/** Simple name only (no import resolution, ADR-006) of a `classType`/`interfaceType` node's own identifier — the first one, ignoring any generic type arguments. */
function simpleTypeName(node: unknown): string | undefined {
  return findFirstToken(node)?.image;
}

/**
 * Simple names out of a `classImplements`/`interfaceExtends` clause's
 * `interfaceTypeList` — both share the exact same shape, so one helper
 * covers a class's `implements` list and an interface's (possibly
 * multiple) `extends` list alike (docs/sprints/SPRINT-13.md).
 */
function interfaceListNames(clause: unknown): string[] {
  const list = childNode(clause, 'interfaceTypeList');
  if (!list) {
    return [];
  }
  const names: string[] = [];
  for (const interfaceType of childNodes(list, 'interfaceType')) {
    const name = simpleTypeName(interfaceType);
    if (name) {
      names.push(name);
    }
  }
  return names;
}

function collectRecordDeclarationNames(source: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(NESTED_RECORD_DECLARATION_PATTERN)) {
    const name = match[1];
    if (name) {
      names.add(name);
    }
  }
  return names;
}

interface TypeFrame {
  name: string;
  readonly annotations: JavaAnnotation[];
  readonly methods: JavaMethod[];
  readonly fields: JavaField[];
  line: number;
  extendsType: string | undefined;
  readonly implementsTypes: string[];
}

/**
 * Walks the CST collecting the package declaration and top-level `class`
 * declarations with their annotations and methods — see java-model.ts and
 * ADR-006 for exactly what is (and isn't) modeled. A stack of "current
 * type" frames means a nested type's methods are correctly attributed to
 * it, not to the enclosing class, even though we don't model nested types
 * as their own entries (we simply never push a frame for anything but a
 * `normalClassDeclaration`, so a nested interface/enum/record's contents
 * are traversed-through inertly rather than mis-attributed).
 */
class JavaSemanticModelVisitor extends BaseJavaCstVisitorWithDefaults {
  // Named to avoid colliding with the base visitor's own `packageName(ctx)`
  // method (for the distinct `packageName` grammar rule) — we override
  // `packageDeclaration` instead, see below.
  collectedPackageName = '';
  readonly types: JavaType[] = [];
  private readonly typeStack: TypeFrame[] = [];
  private readonly nestedRecordNames: ReadonlySet<string>;

  constructor(nestedRecordNames: ReadonlySet<string>) {
    super();
    this.nestedRecordNames = nestedRecordNames;
    this.validateVisitor();
  }

  override packageDeclaration(ctx: PackageDeclarationCtx): void {
    this.collectedPackageName = ctx.Identifier.map((token) => token.image).join('.');
  }

  override classDeclaration(ctx: ClassDeclarationCtx): void {
    const normal = ctx.normalClassDeclaration?.[0];
    if (!normal) {
      // Not a `class` (an enum or record) — not modeled as a type container (ADR-006).
      // We deliberately do not visit into it either, so its members never
      // get attributed to whichever class frame is currently on the stack.
      return;
    }

    const annotations = extractAnnotationsFromModifiers(ctx.classModifier);
    const identifierTokens = normal.children.typeIdentifier[0]?.children.Identifier ?? [];
    const nameToken = identifierTokens[0];
    const name = nameToken ? nameToken.image : '';
    const line = nameToken ? nameToken.startLine : 0;
    const extendsType = normal.children.classExtends?.[0]
      ? simpleTypeName(childNode(normal.children.classExtends[0], 'classType'))
      : undefined;
    const implementsTypes = normal.children.classImplements?.[0]
      ? interfaceListNames(normal.children.classImplements[0])
      : [];

    this.typeStack.push({ name, annotations, methods: [], fields: [], line, extendsType, implementsTypes });

    const classBody = normal.children.classBody[0];
    if (classBody) {
      this.visit(classBody);
    }

    const finished = this.typeStack.pop();
    if (finished) {
      this.types.push({
        name: finished.name,
        kind: 'class',
        annotations: finished.annotations,
        methods: finished.methods,
        fields: finished.fields,
        line: finished.line,
        ...(finished.extendsType !== undefined ? { extendsType: finished.extendsType } : {}),
        implementsTypes: finished.implementsTypes,
      });
    }
  }

  /**
   * Mirrors `classDeclaration` for an `interface` — previously skipped
   * entirely (like an enum/record), which meant a field typed as a service
   * interface (the standard Spring interface+impl pattern) could never be
   * indexed at all, let alone redirected to its real implementation
   * (docs/sprints/SPRINT-13.md). An interface's own `extends` list (it can
   * extend more than one other interface) is captured into the same
   * `implementsTypes` slot a class's `implements` list uses — both answer
   * the same question, "what supertype(s) does this type declare".
   */
  override interfaceDeclaration(ctx: InterfaceDeclarationCtx): void {
    const normal = ctx.normalInterfaceDeclaration?.[0];
    if (!normal) {
      // An `@interface` (annotation type declaration) — not modeled, same
      // as an enum/record; not visited either, for the same reason
      // classDeclaration doesn't visit into a non-class type.
      return;
    }

    const annotations = extractAnnotationsFromModifiers(ctx.interfaceModifier);
    const identifierTokens = normal.children.typeIdentifier[0]?.children.Identifier ?? [];
    const nameToken = identifierTokens[0];
    const name = nameToken ? nameToken.image : '';
    const line = nameToken ? nameToken.startLine : 0;
    const implementsTypes = normal.children.interfaceExtends?.[0]
      ? interfaceListNames(normal.children.interfaceExtends[0])
      : [];

    this.typeStack.push({
      name,
      annotations,
      methods: [],
      fields: [],
      line,
      extendsType: undefined,
      implementsTypes,
    });

    const interfaceBody = normal.children.interfaceBody[0];
    if (interfaceBody) {
      this.visit(interfaceBody);
    }

    const finished = this.typeStack.pop();
    if (finished) {
      this.types.push({
        name: finished.name,
        kind: 'interface',
        annotations: finished.annotations,
        methods: finished.methods,
        fields: finished.fields,
        line: finished.line,
        implementsTypes: finished.implementsTypes,
      });
    }
  }

  override fieldDeclaration(ctx: FieldDeclarationCtx): void {
    const current = this.typeStack[this.typeStack.length - 1];
    if (!current) {
      return;
    }

    const type = findFirstToken(ctx.unannType)?.image ?? '';
    // `static final String X = "literal";` — the common Java idiom of
    // naming a view/redirect target once and returning the constant
    // (docs/sprints/SPRINT-7.md; found in the user's real AdminController).
    const modifiers = ctx.fieldModifier ?? [];
    const isStringConstant =
      type === 'String' &&
      modifiers.some((modifier) => hasChild(modifier, 'Static')) &&
      modifiers.some((modifier) => hasChild(modifier, 'Final'));

    for (const declarator of ctx.variableDeclaratorList[0]?.children.variableDeclarator ?? []) {
      const nameToken = declarator.children.variableDeclaratorId[0]?.children.Identifier?.[0];
      if (!nameToken) {
        continue;
      }
      let stringConstantValue: string | undefined;
      if (isStringConstant) {
        const initializer = childNode(declarator, 'variableInitializer');
        const expression = initializer && childNode(initializer, 'expression');
        stringConstantValue = expression ? leadingStringLiteral(expression) : undefined;
      }
      current.fields.push({
        name: nameToken.image,
        type,
        ...(stringConstantValue !== undefined ? { stringConstantValue } : {}),
      });
    }
  }

  override methodDeclaration(ctx: MethodDeclarationCtx): void {
    const current = this.typeStack[this.typeStack.length - 1];
    if (!current) {
      return;
    }

    const declarator = ctx.methodHeader[0]?.children.methodDeclarator[0];
    const nameToken = declarator?.children.Identifier[0];
    const name = nameToken ? nameToken.image : '';

    if (this.nestedRecordNames.has(name)) {
      // A nested record misparsed as a method — see the comment on
      // collectRecordDeclarationNames above.
      return;
    }

    const annotations = extractAnnotationsFromModifiers(ctx.methodModifier);
    const line = nameToken ? nameToken.startLine : 0;
    const parameterCount = declarator ? parameterCountOf(declarator) : 0;
    const bodyEvents = ctx.methodBody[0] ? extractBodyEvents(ctx.methodBody[0]) : [];

    current.methods.push({ name, annotations, line, parameterCount, bodyEvents });
    // Deliberately never calls this.visit(ctx.methodBody) — body events are
    // extracted directly by extract-body-events.ts, a separate, bounded
    // walk (see docs/sprints/SPRINT-5.md), not through the class-level
    // visitor (which only cares about type/method declarations).
  }

  /**
   * An interface's own method declaration — grammatically distinct from
   * `methodDeclaration` (a separate CST rule) but structurally identical
   * (`methodHeader` + `methodBody`), so the logic mirrors it exactly. An
   * abstract method's `methodBody` is just a `;` (no `block` child), so
   * `extractBodyEvents` naturally returns `[]` for it, same as any other
   * bodyless method; a `default`/`static` interface method's real body is
   * extracted like any other (docs/sprints/SPRINT-13.md).
   */
  override interfaceMethodDeclaration(ctx: InterfaceMethodDeclarationCtx): void {
    const current = this.typeStack[this.typeStack.length - 1];
    if (!current) {
      return;
    }

    const declarator = ctx.methodHeader[0]?.children.methodDeclarator[0];
    const nameToken = declarator?.children.Identifier[0];
    const name = nameToken ? nameToken.image : '';

    if (this.nestedRecordNames.has(name)) {
      return;
    }

    const annotations = extractAnnotationsFromModifiers(ctx.interfaceMethodModifier);
    const line = nameToken ? nameToken.startLine : 0;
    const parameterCount = declarator ? parameterCountOf(declarator) : 0;
    const bodyEvents = ctx.methodBody[0] ? extractBodyEvents(ctx.methodBody[0]) : [];

    current.methods.push({ name, annotations, line, parameterCount, bodyEvents });
  }
}

/**
 * Parses one Java source file's text into a Java Semantic Model. Never
 * throws: malformed input (or Java syntax `java-parser` doesn't support)
 * comes back as a `ParserError`, letting callers skip the file rather than
 * fail an entire scan (docs/architecture/analysis-pipeline.md).
 */
export function parseJavaFile(source: string): Result<JavaSourceFile, ParserError> {
  let cst;
  try {
    cst = parse(source);
  } catch (error) {
    return err(
      new ParserError({
        message: error instanceof Error ? error.message : 'Failed to parse Java source.',
        cause: error,
      }),
    );
  }

  const visitor = new JavaSemanticModelVisitor(collectRecordDeclarationNames(source));
  visitor.visit(cst);

  return ok({ packageName: visitor.collectedPackageName, types: visitor.types });
}
