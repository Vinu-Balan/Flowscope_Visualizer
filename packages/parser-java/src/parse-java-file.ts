import { ParserError, err, ok, type Result } from '@flowscope/core';
import {
  BaseJavaCstVisitorWithDefaults,
  parse,
  type ClassDeclarationCtx,
  type FieldDeclarationCtx,
  type MethodDeclarationCtx,
  type PackageDeclarationCtx,
} from 'java-parser';
import { findFirstToken } from './cst-utils';
import { extractAnnotationsFromModifiers } from './extract-annotation';
import { extractBodyEvents } from './extract-body-events';
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

    this.typeStack.push({ name, annotations, methods: [], fields: [], line });

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
      });
    }
  }

  override fieldDeclaration(ctx: FieldDeclarationCtx): void {
    const current = this.typeStack[this.typeStack.length - 1];
    if (!current) {
      return;
    }

    const type = findFirstToken(ctx.unannType)?.image ?? '';
    for (const declarator of ctx.variableDeclaratorList[0]?.children.variableDeclarator ?? []) {
      const nameToken = declarator.children.variableDeclaratorId[0]?.children.Identifier?.[0];
      if (nameToken) {
        current.fields.push({ name: nameToken.image, type });
      }
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
    const bodyEvents = ctx.methodBody[0] ? extractBodyEvents(ctx.methodBody[0]) : [];

    current.methods.push({ name, annotations, line, bodyEvents });
    // Deliberately never calls this.visit(ctx.methodBody) — body events are
    // extracted directly by extract-body-events.ts, a separate, bounded
    // walk (see docs/sprints/SPRINT-5.md), not through the class-level
    // visitor (which only cares about type/method declarations).
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
