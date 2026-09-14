/**
 * Extracts a flat, source-ordered list of `JavaBodyEvent`s from a method's
 * body CST — the calls it makes, the objects it constructs, the `if`
 * guards/`throw`s/`return`s it contains — for `packages/business-analyzer`
 * to infer a business flow from. Deliberately not a control-flow model:
 * only a method's *direct* block is walked (an `if`'s then-branch is
 * followed one level, since guard clauses are exactly the pattern we care
 * about; loops/switch/try-catch/lambdas are not modeled at all). See
 * "Planned scope" in docs/sprints/SPRINT-5.md.
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
} from './cst-utils';
import type { JavaBodyEvent } from './java-model';

const MAX_BLOCK_DEPTH = 6;

interface CallDescription {
  readonly targetName: string;
  readonly methodName: string;
  readonly line: number;
}

interface ConstructDescription {
  readonly typeName: string;
  readonly looksGenerated: boolean;
  readonly line: number;
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

/** A `primary` is a call when its first suffix is call parens applied to a plain identifier chain (not a `new` expression). */
function describeCallAtPrimary(primary: unknown): CallDescription | undefined {
  const prefix = childNode(primary, 'primaryPrefix');
  if (!prefix || hasChild(prefix, 'newExpression')) {
    return undefined;
  }
  const fqn = childNode(prefix, 'fqnOrRefType');
  if (!fqn) {
    return undefined;
  }
  const identifiers = identifierChainOf(fqn);
  if (identifiers.length === 0) {
    return undefined;
  }

  const suffixes = childNodes(primary, 'primarySuffix');
  const firstSuffix = suffixes[0];
  if (!firstSuffix || !hasChild(firstSuffix, 'methodInvocationSuffix')) {
    return undefined;
  }

  const methodName = identifiers[identifiers.length - 1] ?? '';
  const targetName = identifiers.slice(0, -1).join('.');
  const line = findFirstToken(firstSuffix)?.startLine ?? findFirstToken(fqn)?.startLine ?? 0;
  return { targetName, methodName, line };
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
  return { typeName, looksGenerated, line };
}

function emitExpressionEvent(expressionNode: unknown, events: JavaBodyEvent[]): void {
  const primary = unwrapToPrimary(expressionNode);
  if (!primary) {
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
    events.push({
      kind: 'call',
      line: call.line,
      targetName: call.targetName,
      methodName: call.methodName,
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
  if (expression) {
    const primary = unwrapToPrimary(expression);
    const construct = primary ? describeConstruct(primary) : undefined;
    if (construct) {
      exceptionType = construct.typeName;
    }
  }
  events.push({ kind: 'throw', line, exceptionType });
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
  const primary = unwrapToPrimary(expression);
  const call = primary ? describeCallAtPrimary(primary) : undefined;
  events.push({
    kind: 'return',
    line,
    returnsCallTarget: call?.targetName,
    returnsCallMethod: call?.methodName,
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

  events.push({
    kind: 'if',
    line,
    conditionText,
    guardThrows: firstThenKind === 'throw',
    guardReturns: firstThenKind === 'return',
  });

  if (conditionExpression) {
    emitExpressionEvent(conditionExpression, events);
  }
  if (thenStatement) {
    processStatement(thenStatement, events, depth + 1);
  }
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
