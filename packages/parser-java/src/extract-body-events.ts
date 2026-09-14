/**
 * Extracts a flat, source-ordered list of `JavaBodyEvent`s from a method's
 * body CST — the calls it makes, the objects it constructs, the `if`
 * guards/`throw`s/`return`s it contains — for `packages/business-analyzer`
 * to infer a business flow from. Deliberately not a control-flow model:
 * only a method's *direct* block is walked (an `if`'s then-branch is
 * followed one level, since guard clauses are exactly the pattern we care
 * about; loops/switch/try-catch/lambdas are not modeled at all). See
 * "Planned scope" in docs/sprints/SPRINT-5.md and docs/sprints/SPRINT-7.md.
 *
 * Also deliberately generic rather than exhaustive, in the same spirit as
 * cst-utils.ts and ADR-006: a handful of structural accessors over the
 * CST's `children` maps, rather than importing every one of java-parser's
 * generated `*Ctx` types for rules it doesn't otherwise expose.
 */

import {
  childNode,
  childNodes,
  findAllTokenImages,
  findFirstToken,
  findFirstTokenImage,
  hasChild,
  renderTokensInOrder,
  unquoteStringLiteral,
} from './cst-utils';
import type { JavaBodyEvent } from './java-model';

const MAX_BLOCK_DEPTH = 6;

interface CallDescription {
  readonly targetName: string;
  readonly methodName: string;
  readonly line: number;
  /** The call's own argument list CST node, if any — for `firstArgumentLiteral`. */
  readonly argumentList: unknown;
}

interface ConstructDescription {
  readonly typeName: string;
  readonly looksGenerated: boolean;
  readonly line: number;
  readonly argumentList: unknown;
}

/**
 * Unwraps `expression -> conditionalExpression -> binaryExpression ->
 * unaryExpression -> primary` as long as every level has exactly one
 * child (i.e. no actual operator/ternary is present) — the shape a bare
 * call or object construction always takes. Anything else (a real binary
 * comparison like `x == null`, a unary `!flag`, a ternary) returns
 * `undefined`, and callers fall back to a raw token rendering.
 */
function unwrapToPrimary(expressionNode: unknown): unknown {
  const conditional = childNode(expressionNode, 'conditionalExpression');
  if (!conditional || Object.keys(conditional.children).length !== 1) {
    return undefined;
  }
  const binary = childNode(conditional, 'binaryExpression');
  if (!binary || hasChild(binary, 'BinaryOperator')) {
    return undefined;
  }
  const unaryList = childNodes(binary, 'unaryExpression');
  if (unaryList.length !== 1) {
    return undefined;
  }
  const unary = unaryList[0];
  if (!unary || Object.keys(unary.children).length !== 1) {
    return undefined;
  }
  return childNode(unary, 'primary');
}

function identifierChainOf(fqnOrRefType: unknown): string[] {
  const identifiers: string[] = [];
  const first = childNode(fqnOrRefType, 'fqnOrRefTypePartFirst');
  const firstCommon = first && childNode(first, 'fqnOrRefTypePartCommon');
  const firstId = firstCommon && findFirstTokenImage(firstCommon, 'Identifier');
  if (firstId) {
    identifiers.push(firstId);
  }
  for (const rest of childNodes(fqnOrRefType, 'fqnOrRefTypePartRest')) {
    const restCommon = childNode(rest, 'fqnOrRefTypePartCommon');
    const restId = restCommon && findFirstTokenImage(restCommon, 'Identifier');
    if (restId) {
      identifiers.push(restId);
    }
  }
  return identifiers;
}

/**
 * A `primary`'s call target/method, found by walking its `primarySuffix`
 * chain generally — starting from whatever identifier chain its
 * `fqnOrRefType` prefix provides (possibly none, e.g. `this.x.y()` has no
 * `fqnOrRefType` prefix at all, just a `This` token — see
 * docs/sprints/SPRINT-7.md), extending it through any leading `.identifier`
 * suffixes, and stopping at the first call. A chained call further along
 * (`.build()` after `.name(...)`) is deliberately not reached — only the
 * first call in the chain is ever "the" call for a given primary.
 */
function describeCallAtPrimary(primary: unknown): CallDescription | undefined {
  const prefix = childNode(primary, 'primaryPrefix');
  if (!prefix || hasChild(prefix, 'newExpression')) {
    return undefined;
  }

  const fqn = childNode(prefix, 'fqnOrRefType');
  const chain = fqn ? identifierChainOf(fqn) : [];

  for (const suffix of childNodes(primary, 'primarySuffix')) {
    const invocation = childNode(suffix, 'methodInvocationSuffix');
    if (invocation) {
      if (chain.length === 0) {
        return undefined;
      }
      const methodName = chain[chain.length - 1] ?? '';
      const targetName = chain.slice(0, -1).join('.');
      const line = findFirstToken(suffix)?.startLine ?? findFirstToken(prefix)?.startLine ?? 0;
      return { targetName, methodName, line, argumentList: childNode(invocation, 'argumentList') };
    }
    const nextId = hasChild(suffix, 'Dot') ? findFirstTokenImage(suffix, 'Identifier') : undefined;
    if (!nextId) {
      // Something we don't model (array index, method reference, …) — stop.
      return undefined;
    }
    chain.push(nextId);
  }
  return undefined;
}

/**
 * Recognizes the builder pattern — `X.builder().a(...).b(...).build()` —
 * as constructing an `X`, rather than letting the generic call detection
 * above latch onto the first call in the chain (`.builder()` itself,
 * producing a meaningless "Builder" step — found via real-world testing,
 * see docs/sprints/SPRINT-7.md). Requires the base chain's last segment
 * to look like a builder factory *and* the suffix chain to actually reach
 * a trailing `.build()` call, so an unrelated `Foo.builder()` (rare)
 * falls through to ordinary call handling instead of misfiring.
 */
function isBuilderChain(primary: unknown): { readonly typeName: string; readonly line: number } | undefined {
  const prefix = childNode(primary, 'primaryPrefix');
  const fqn = prefix && childNode(prefix, 'fqnOrRefType');
  if (!fqn) {
    return undefined;
  }
  const chain = identifierChainOf(fqn);
  const lastBaseId = chain[chain.length - 1];
  const typeName = chain[chain.length - 2];
  if (chain.length < 2 || !lastBaseId || !/^builder$/iu.test(lastBaseId) || !typeName) {
    return undefined;
  }

  const suffixes = childNodes(primary, 'primarySuffix');
  for (const [index, suffix] of suffixes.entries()) {
    if (hasChild(suffix, 'methodInvocationSuffix')) {
      continue;
    }
    const id = findFirstTokenImage(suffix, 'Identifier');
    const next = suffixes[index + 1];
    if (id && /^build$/iu.test(id) && next && hasChild(next, 'methodInvocationSuffix')) {
      return { typeName, line: findFirstToken(fqn)?.startLine ?? 0 };
    }
  }
  return undefined;
}

function describeConstruct(primary: unknown): ConstructDescription | undefined {
  const prefix = childNode(primary, 'primaryPrefix');
  const newExpr = prefix && childNode(prefix, 'newExpression');
  const unqualified = newExpr && childNode(newExpr, 'unqualifiedClassInstanceCreationExpression');
  if (!unqualified) {
    return undefined;
  }
  const typeNode = childNode(unqualified, 'classOrInterfaceTypeToInstantiate');
  const typeName = typeNode && findFirstTokenImage(typeNode, 'Identifier');
  if (!typeName) {
    return undefined;
  }
  const argumentList = childNode(unqualified, 'argumentList');
  const looksGenerated = argumentList
    ? /randomuuid|generate|uuid/iu.test(findAllTokenImages(argumentList, 'Identifier').join(' '))
    : false;
  const line = findFirstToken(unqualified)?.startLine ?? 0;
  return { typeName, looksGenerated, line, argumentList };
}

/** A `primary` that's a bare string literal (`primaryPrefix.literal`). */
function stringLiteralOf(primary: unknown): string | undefined {
  const prefix = childNode(primary, 'primaryPrefix');
  const literal = prefix && childNode(prefix, 'literal');
  const raw = literal && findFirstTokenImage(literal, 'StringLiteral');
  return raw !== undefined ? unquoteStringLiteral(raw) : undefined;
}

/**
 * A bare string literal, or the literal left-hand side of a
 * `"literal" + expr` concatenation (the common `"Message: " + value`
 * shape) — the leading portion is still genuinely informative even
 * though the full string isn't statically known. Not resolved for a
 * `static final` constant reference — see docs/sprints/SPRINT-7.md.
 */
export function leadingStringLiteral(expressionNode: unknown): string | undefined {
  const primary = unwrapToPrimary(expressionNode);
  if (primary) {
    const direct = stringLiteralOf(primary);
    if (direct !== undefined) {
      return direct;
    }
  }

  const conditional = childNode(expressionNode, 'conditionalExpression');
  const binary = conditional && childNode(conditional, 'binaryExpression');
  if (!binary) {
    return undefined;
  }
  const firstUnary = childNodes(binary, 'unaryExpression')[0];
  if (!firstUnary || Object.keys(firstUnary.children).length !== 1) {
    return undefined;
  }
  const firstPrimary = childNode(firstUnary, 'primary');
  return firstPrimary ? stringLiteralOf(firstPrimary) : undefined;
}

/**
 * A `primary` that's nothing but a single bare identifier — no member
 * access, no call — e.g. `REDIRECT_ADMIN_PRODUCTS` in `return
 * REDIRECT_ADMIN_PRODUCTS;`. Distinguished from a qualified reference
 * (`this.field`, `a.b`) or a call by requiring both a one-element
 * `fqnOrRefType` chain and zero `primarySuffix`es.
 */
function bareIdentifierOf(primary: unknown): string | undefined {
  const prefix = childNode(primary, 'primaryPrefix');
  const fqn = prefix && childNode(prefix, 'fqnOrRefType');
  if (!fqn || childNodes(primary, 'primarySuffix').length > 0) {
    return undefined;
  }
  const chain = identifierChainOf(fqn);
  return chain.length === 1 ? chain[0] : undefined;
}

function firstArgumentLiteral(argumentList: unknown): string | undefined {
  const firstArgumentExpression = argumentList ? childNode(argumentList, 'expression') : undefined;
  return firstArgumentExpression ? leadingStringLiteral(firstArgumentExpression) : undefined;
}

function emitExpressionEvent(expressionNode: unknown, events: JavaBodyEvent[]): void {
  const primary = unwrapToPrimary(expressionNode);
  if (!primary) {
    return;
  }

  const builder = isBuilderChain(primary);
  if (builder) {
    events.push({ kind: 'construct', line: builder.line, methodName: builder.typeName, looksGenerated: false });
    return;
  }

  const construct = describeConstruct(primary);
  if (construct) {
    events.push({
      kind: 'construct',
      line: construct.line,
      methodName: construct.typeName,
      looksGenerated: construct.looksGenerated,
    });
    return;
  }

  const call = describeCallAtPrimary(primary);
  if (call) {
    const firstStringArgument = firstArgumentLiteral(call.argumentList);
    const argumentCount = call.argumentList ? childNodes(call.argumentList, 'expression').length : 0;
    events.push({
      kind: 'call',
      line: call.line,
      targetName: call.targetName,
      methodName: call.methodName,
      argumentCount,
      ...(firstStringArgument !== undefined ? { firstStringArgument } : {}),
    });
  }
}

function processLocalVarDecl(localVarDeclStatement: unknown, events: JavaBodyEvent[]): void {
  const decl = childNode(localVarDeclStatement, 'localVariableDeclaration');
  const declaratorList = decl && childNode(decl, 'variableDeclaratorList');
  const declarators = declaratorList ? childNodes(declaratorList, 'variableDeclarator') : [];
  for (const declarator of declarators) {
    const initializer = childNode(declarator, 'variableInitializer');
    const expression = initializer && childNode(initializer, 'expression');
    if (expression) {
      emitExpressionEvent(expression, events);
    }
  }
}

function processExpressionStatementCall(
  statementWithoutTrailingSubstatement: unknown,
  events: JavaBodyEvent[],
): void {
  const exprStmt = childNode(statementWithoutTrailingSubstatement, 'expressionStatement');
  const stmtExpr = exprStmt && childNode(exprStmt, 'statementExpression');
  const expression = stmtExpr && childNode(stmtExpr, 'expression');
  if (expression) {
    emitExpressionEvent(expression, events);
  }
}

function processThrow(throwStatement: unknown, events: JavaBodyEvent[]): void {
  const expression = childNode(throwStatement, 'expression');
  const line = findFirstToken(throwStatement)?.startLine ?? 0;
  let exceptionType = 'Exception';
  let exceptionMessage: string | undefined;
  if (expression) {
    const primary = unwrapToPrimary(expression);
    const construct = primary ? describeConstruct(primary) : undefined;
    if (construct) {
      exceptionType = construct.typeName;
      exceptionMessage = firstArgumentLiteral(construct.argumentList);
    }
  }
  events.push({
    kind: 'throw',
    line,
    exceptionType,
    ...(exceptionMessage !== undefined ? { exceptionMessage } : {}),
  });
}

function isNullLiteral(expressionNode: unknown): boolean {
  return renderTokensInOrder(expressionNode).trim() === 'null';
}

function processReturn(returnStatement: unknown, events: JavaBodyEvent[]): void {
  const line = findFirstToken(returnStatement)?.startLine ?? 0;
  const expression = childNode(returnStatement, 'expression');
  if (!expression) {
    events.push({ kind: 'return', line });
    return;
  }
  if (isNullLiteral(expression)) {
    events.push({ kind: 'return', line, returnsNullLiteral: true });
    return;
  }

  const stringLiteral = leadingStringLiteral(expression);
  if (stringLiteral !== undefined) {
    events.push({ kind: 'return', line, returnsStringLiteral: stringLiteral });
    return;
  }

  const primary = unwrapToPrimary(expression);
  const call = primary ? describeCallAtPrimary(primary) : undefined;
  if (call) {
    events.push({ kind: 'return', line, returnsCallTarget: call.targetName, returnsCallMethod: call.methodName });
    return;
  }

  const identifier = primary ? bareIdentifierOf(primary) : undefined;
  events.push({
    kind: 'return',
    line,
    ...(identifier !== undefined ? { returnsIdentifier: identifier } : {}),
  });
}

type FirstStatementKind = 'throw' | 'return' | 'other';

/** Looks past a `{ }` block wrapper to classify a then-branch's very first statement, for guard-clause detection. */
function firstStatementKindOf(statementNode: unknown): FirstStatementKind | undefined {
  if (hasChild(statementNode, 'ifStatement')) {
    return 'other';
  }
  const swts = childNode(statementNode, 'statementWithoutTrailingSubstatement');
  if (!swts) {
    return undefined;
  }
  if (hasChild(swts, 'throwStatement')) {
    return 'throw';
  }
  if (hasChild(swts, 'returnStatement')) {
    return 'return';
  }
  const block = childNode(swts, 'block');
  if (block) {
    const blockStatements = childNode(block, 'blockStatements');
    const firstBlockStatement = blockStatements
      ? childNodes(blockStatements, 'blockStatement')[0]
      : undefined;
    const innerStatement = firstBlockStatement && childNode(firstBlockStatement, 'statement');
    return innerStatement ? firstStatementKindOf(innerStatement) : undefined;
  }
  return 'other';
}

function processIf(ifStatement: unknown, events: JavaBodyEvent[], depth: number): void {
  const conditionExpression = childNode(ifStatement, 'expression');
  const line = findFirstToken(ifStatement)?.startLine ?? 0;

  let conditionText = '';
  if (conditionExpression) {
    const primary = unwrapToPrimary(conditionExpression);
    const call = primary ? describeCallAtPrimary(primary) : undefined;
    conditionText = call
      ? call.targetName
        ? `${call.targetName}.${call.methodName}(...)`
        : `${call.methodName}(...)`
      : renderTokensInOrder(conditionExpression);
  }

  const thenStatement = childNode(ifStatement, 'statement');
  const firstThenKind = thenStatement ? firstStatementKindOf(thenStatement) : undefined;

  // Extracted into a scratch array first (not appended directly) so the
  // 'if' event can record exactly how many of the following events
  // belong to the then-branch — the flat event list otherwise has no
  // block boundaries, so a caller couldn't tell "part of the then-branch"
  // from "comes after the if" for a branch that isn't a bare
  // throw/return (docs/sprints/SPRINT-8.md; found via a real `if` with no
  // `else` whose body just sets a value and falls through — every event
  // after it was wrongly absorbed into the "continue" branch).
  const thenEvents: JavaBodyEvent[] = [];
  if (thenStatement) {
    processStatement(thenStatement, thenEvents, depth + 1);
  }

  events.push({
    kind: 'if',
    line,
    conditionText,
    guardThrows: firstThenKind === 'throw',
    guardReturns: firstThenKind === 'return',
    thenEventCount: thenEvents.length,
  });

  if (conditionExpression) {
    emitExpressionEvent(conditionExpression, events);
  }
  events.push(...thenEvents);
}

function processStatement(statementNode: unknown, events: JavaBodyEvent[], depth: number): void {
  if (depth > MAX_BLOCK_DEPTH) {
    return;
  }

  const ifStatement = childNode(statementNode, 'ifStatement');
  if (ifStatement) {
    processIf(ifStatement, events, depth);
    return;
  }

  const swts = childNode(statementNode, 'statementWithoutTrailingSubstatement');
  if (!swts) {
    // A loop/switch/try/labeled/synchronized statement — not modeled (bounded scope).
    return;
  }

  const block = childNode(swts, 'block');
  if (block) {
    walkBlock(block, events, depth + 1);
    return;
  }

  const throwStatement = childNode(swts, 'throwStatement');
  if (throwStatement) {
    processThrow(throwStatement, events);
    return;
  }

  const returnStatement = childNode(swts, 'returnStatement');
  if (returnStatement) {
    processReturn(returnStatement, events);
    return;
  }

  processExpressionStatementCall(swts, events);
}

function processBlockStatement(
  blockStatement: unknown,
  events: JavaBodyEvent[],
  depth: number,
): void {
  const localVarDecl = childNode(blockStatement, 'localVariableDeclarationStatement');
  if (localVarDecl) {
    processLocalVarDecl(localVarDecl, events);
    return;
  }
  const statement = childNode(blockStatement, 'statement');
  if (statement) {
    processStatement(statement, events, depth);
  }
  // A local class/interface declaration — not modeled.
}

function walkBlock(block: unknown, events: JavaBodyEvent[], depth: number): void {
  if (depth > MAX_BLOCK_DEPTH) {
    return;
  }
  const blockStatements = childNode(block, 'blockStatements');
  if (!blockStatements) {
    return;
  }
  for (const blockStatement of childNodes(blockStatements, 'blockStatement')) {
    processBlockStatement(blockStatement, events, depth);
  }
}

/** Extracts body events from a `methodBody` CST node (`ctx.methodBody[0]` on `MethodDeclarationCtx`). */
export function extractBodyEvents(methodBody: unknown): JavaBodyEvent[] {
  const block = childNode(methodBody, 'block');
  if (!block) {
    return [];
  }
  const events: JavaBodyEvent[] = [];
  walkBlock(block, events, 0);
  return events;
}
