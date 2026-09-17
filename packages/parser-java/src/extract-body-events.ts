/**
 * Extracts a flat, source-ordered list of `JavaBodyEvent`s from a method's
 * body CST — the calls it makes, the objects it constructs, the `if`
 * guards/`throw`s/`return`s/`try`/`catch`es/loops/`switch`es it contains —
 * for `packages/business-analyzer` to infer a business flow from.
 * Deliberately not a full control-flow model: an `if`'s then/else
 * branches, a `try`'s try-block/catch-clauses, a loop's body (walked
 * exactly once — see docs/sprints/SPRINT-13.md), and a `switch`'s case
 * labels are each walked one level; a `finally` clause, a classic-vs-arrow
 * `switch` *expression* (as opposed to the classic `case X:` *statement*
 * form modeled here), and lambda/stream bodies are not modeled — see
 * docs/sprints/SPRINT-13.md's "Explicitly deferred". See "Planned scope"
 * in docs/sprints/SPRINT-5.md and docs/sprints/SPRINT-7.md.
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
 *
 * A plain assignment (`user = repo.find(id);`, re-assigning an
 * already-declared variable rather than declaring one) parses into this
 * *same* `binaryExpression` shape — one `unaryExpression` — but paired
 * with an `AssignmentOperator` and the right-hand side as a nested
 * `expression`, not a second `unaryExpression`. Left unhandled, that
 * single `unaryExpression` is the assignment's *target* (`user`), not its
 * value — unwrapping to it directly silently discarded the real call on
 * the right entirely (docs/sprints/SPRINT-12.md; found via a real
 * `catch`-clause body that reassigns a variable declared before the
 * `try`, a common pattern this extractor was blind to). Recursing into
 * the right-hand side instead — itself a full `expression`, so `a = b = c`
 * chains resolve correctly too — fixes it for every caller of
 * `unwrapToPrimary` at once, not just assignment-aware ones.
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
  if (hasChild(binary, 'AssignmentOperator')) {
    const rhs = childNode(binary, 'expression');
    return rhs ? unwrapToPrimary(rhs) : undefined;
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

/**
 * The call nested as a call's *first argument*, if there is one — e.g.
 * `bookingService.createBooking(request)` inside
 * `ResponseEntity.ok(bookingService.createBooking(request))`. A single-
 * expression-body controller method delegating straight to a service call
 * wrapped in a response type is one of the most common real Spring MVC
 * shapes there is, and without this, the actual business call is
 * completely invisible — only the outer wrapper call
 * (`ResponseEntity.ok`) was ever seen (docs/sprints/SPRINT-12.md; found
 * via a real `return ResponseEntity.ok(bookingService.createBooking(request));`).
 * Only the first argument is checked — the common case for a wrapper call
 * — not a general walk of every argument.
 */
function firstArgumentCall(argumentList: unknown): CallDescription | undefined {
  const firstArgumentExpression = argumentList ? childNode(argumentList, 'expression') : undefined;
  if (!firstArgumentExpression) {
    return undefined;
  }
  const primary = unwrapToPrimary(firstArgumentExpression);
  return primary ? describeCallAtPrimary(primary) : undefined;
}

/**
 * The call/constructor/throw's argument list exactly as written, e.g.
 * `name, categoryId, price` — not an evaluation, just the source text
 * (`renderTokensInOrder`), so a developer reading the Technical panel
 * sees which variable or literal is actually in play at that step without
 * opening the source file (docs/sprints/SPRINT-8.md). Always a string,
 * empty for a genuinely zero-argument call — never omitted, so a caller
 * can tell "confirmed no arguments" from "not captured" and never renders
 * a misleading `(...)` placeholder for a call that truly takes nothing.
 */
function argumentsTextOf(argumentList: unknown): string {
  return argumentList ? renderTokensInOrder(argumentList) : '';
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
      argumentsText: argumentsTextOf(construct.argumentList),
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
      argumentsText: argumentsTextOf(call.argumentList),
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
  let argumentsText: string | undefined;
  if (expression) {
    const primary = unwrapToPrimary(expression);
    const construct = primary ? describeConstruct(primary) : undefined;
    if (construct) {
      exceptionType = construct.typeName;
      exceptionMessage = firstArgumentLiteral(construct.argumentList);
      argumentsText = argumentsTextOf(construct.argumentList);
    }
  }
  events.push({
    kind: 'throw',
    line,
    exceptionType,
    ...(exceptionMessage !== undefined ? { exceptionMessage } : {}),
    ...(argumentsText !== undefined ? { argumentsText } : {}),
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
    const nestedCall = firstArgumentCall(call.argumentList);
    events.push({
      kind: 'return',
      line,
      returnsCallTarget: call.targetName,
      returnsCallMethod: call.methodName,
      returnsCallArgumentsText: argumentsTextOf(call.argumentList),
      ...(nestedCall
        ? {
            returnsNestedCallTarget: nestedCall.targetName,
            returnsNestedCallMethod: nestedCall.methodName,
            returnsNestedCallArgumentCount: nestedCall.argumentList
              ? childNodes(nestedCall.argumentList, 'expression').length
              : 0,
            returnsNestedCallArgumentsText: argumentsTextOf(nestedCall.argumentList),
          }
        : {}),
    });
    return;
  }

  const identifier = primary ? bareIdentifierOf(primary) : undefined;
  events.push({
    kind: 'return',
    line,
    ...(identifier !== undefined ? { returnsIdentifier: identifier } : {}),
  });
}

interface TryParts {
  readonly block: unknown;
  readonly catches: unknown;
}

/**
 * A plain `try { }` and a `try (Resource r = ...) { }` (try-with-resources)
 * parse to different CST shapes (`tryStatement.block`/`catches` directly,
 * vs. nested one level under `tryStatement.tryWithResourcesStatement`) but
 * both carry the same `block`/`catches` children once unwrapped — the
 * resource declaration itself isn't modeled, only the body
 * (docs/sprints/SPRINT-12.md).
 */
function tryStatementParts(tryStatement: unknown): TryParts | undefined {
  const plainBlock = childNode(tryStatement, 'block');
  if (plainBlock) {
    return { block: plainBlock, catches: childNode(tryStatement, 'catches') };
  }
  const withResources = childNode(tryStatement, 'tryWithResourcesStatement');
  const withResourcesBlock = withResources ? childNode(withResources, 'block') : undefined;
  if (withResources && withResourcesBlock) {
    return { block: withResourcesBlock, catches: childNode(withResources, 'catches') };
  }
  return undefined;
}

/**
 * Extracts a `try`/`catch` as one `'try'` event (bounding the try-block's
 * own events) followed by one `'catch'` event per clause (each bounding
 * its own body's events) — the same flat, count-bounded layout `processIf`
 * uses for then/else branches, extended to N branches instead of 2. A
 * `finally` clause isn't modeled (docs/sprints/SPRINT-12.md).
 */
function processTry(tryStatement: unknown, events: JavaBodyEvent[], depth: number): void {
  const parts = tryStatementParts(tryStatement);
  if (!parts) {
    return;
  }
  const line = findFirstToken(tryStatement)?.startLine ?? 0;

  const tryEvents: JavaBodyEvent[] = [];
  walkBlock(parts.block, tryEvents, depth + 1);

  interface CatchGroup {
    readonly line: number;
    readonly exceptionType: string;
    readonly events: JavaBodyEvent[];
  }
  const catchGroups: CatchGroup[] = [];
  for (const clause of parts.catches ? childNodes(parts.catches, 'catchClause') : []) {
    const formalParam = childNode(clause, 'catchFormalParameter');
    const catchType = formalParam ? childNode(formalParam, 'catchType') : undefined;
    const exceptionType = (catchType && findFirstTokenImage(catchType, 'Identifier')) || 'Exception';
    const clauseBlock = childNode(clause, 'block');
    const clauseEvents: JavaBodyEvent[] = [];
    if (clauseBlock) {
      walkBlock(clauseBlock, clauseEvents, depth + 1);
    }
    catchGroups.push({
      line: findFirstToken(clause)?.startLine ?? line,
      exceptionType,
      events: clauseEvents,
    });
  }

  events.push({ kind: 'try', line, tryEventCount: tryEvents.length, catchCount: catchGroups.length });
  events.push(...tryEvents);
  for (const group of catchGroups) {
    events.push({
      kind: 'catch',
      line: group.line,
      exceptionType: group.exceptionType,
      catchEventCount: group.events.length,
    });
    events.push(...group.events);
  }
}

/**
 * Walks a loop's body exactly once — "this happens for each iteration",
 * the same honest framing a static flow diagram has to use for any
 * looping construct — and records it as a single `'loop'` event bounding
 * those events, the same count-bounded layout `processTry`'s try-block
 * uses. `headerText` is whatever's shown as `conditionText`; `bodyStatement`
 * is the loop's own `statement` child, walked through the ordinary
 * `processStatement` (it may itself be a `{ }` block or a bare single
 * statement — same shape an `if`'s then-branch can take)
 * (docs/sprints/SPRINT-13.md).
 */
function processLoop(
  bodyStatement: unknown,
  headerText: string,
  loopVariableType: string | undefined,
  line: number,
  events: JavaBodyEvent[],
  depth: number,
): void {
  const bodyEvents: JavaBodyEvent[] = [];
  processStatement(bodyStatement, bodyEvents, depth + 1);

  events.push({
    kind: 'loop',
    line,
    conditionText: headerText,
    loopEventCount: bodyEvents.length,
    ...(loopVariableType !== undefined ? { loopVariableType } : {}),
  });
  events.push(...bodyEvents);
}

function processForStatement(forStatement: unknown, events: JavaBodyEvent[], depth: number): void {
  const line = findFirstToken(forStatement)?.startLine ?? 0;

  const enhanced = childNode(forStatement, 'enhancedForStatement');
  if (enhanced) {
    const localVarDecl = childNode(enhanced, 'localVariableDeclaration');
    const collectionExpr = childNode(enhanced, 'expression');
    const bodyStatement = childNode(enhanced, 'statement');
    if (!bodyStatement) {
      return;
    }
    const localVariableType = localVarDecl
      ? childNode(localVarDecl, 'localVariableType')
      : undefined;
    const loopVariableType = localVariableType
      ? findFirstTokenImage(localVariableType, 'Identifier')
      : undefined;
    const headerText = `${localVarDecl ? renderTokensInOrder(localVarDecl) : ''} : ${
      collectionExpr ? renderTokensInOrder(collectionExpr) : ''
    }`;
    processLoop(bodyStatement, headerText, loopVariableType, line, events, depth);
    return;
  }

  const basic = childNode(forStatement, 'basicForStatement');
  if (!basic) {
    return;
  }
  const bodyStatement = childNode(basic, 'statement');
  if (!bodyStatement) {
    return;
  }
  const forInit = childNode(basic, 'forInit');
  const condition = childNode(basic, 'expression');
  const forUpdate = childNode(basic, 'forUpdate');
  const headerText = `${forInit ? renderTokensInOrder(forInit) : ''}; ${
    condition ? renderTokensInOrder(condition) : ''
  }; ${forUpdate ? renderTokensInOrder(forUpdate) : ''}`;
  processLoop(bodyStatement, headerText, undefined, line, events, depth);
}

function processWhileStatement(whileStatement: unknown, events: JavaBodyEvent[], depth: number): void {
  const line = findFirstToken(whileStatement)?.startLine ?? 0;
  const condition = childNode(whileStatement, 'expression');
  const bodyStatement = childNode(whileStatement, 'statement');
  if (!bodyStatement) {
    return;
  }
  processLoop(
    bodyStatement,
    condition ? renderTokensInOrder(condition) : '',
    undefined,
    line,
    events,
    depth,
  );
}

function processDoStatement(doStatement: unknown, events: JavaBodyEvent[], depth: number): void {
  const line = findFirstToken(doStatement)?.startLine ?? 0;
  const condition = childNode(doStatement, 'expression');
  const bodyStatement = childNode(doStatement, 'statement');
  if (!bodyStatement) {
    return;
  }
  processLoop(
    bodyStatement,
    condition ? renderTokensInOrder(condition) : '',
    undefined,
    line,
    events,
    depth,
  );
}

/**
 * A `switch`'s selector expression plus one `'case'` event per label
 * (including `default:`), each bounding its own body's events up to
 * (not including) a `break`/the next label — the same per-branch layout
 * `processTry` uses for catch clauses, generalized to N labels instead of
 * N catch types. A `break`/`continue`/fallthrough isn't modeled as its
 * own event (there's no `JavaBodyEventKind` for it); a case that falls
 * through into the next without a `break` simply has whatever the next
 * label's own body contains appended after it in the flat list, same as
 * any other unrecognized statement being silently skipped
 * (docs/sprints/SPRINT-13.md). Only the classic `case X:`/`default:`
 * label form is modeled — a Java 14+ arrow-style `case X -> ...`/switch
 * expression is a different CST shape, not modeled (no real evidence for
 * it yet, same evidence-driven scoping as everywhere else here).
 */
function processSwitch(switchStatement: unknown, events: JavaBodyEvent[], depth: number): void {
  const line = findFirstToken(switchStatement)?.startLine ?? 0;
  const selector = childNode(switchStatement, 'expression');
  const switchBlock = childNode(switchStatement, 'switchBlock');
  const groups = switchBlock ? childNodes(switchBlock, 'switchBlockStatementGroup') : [];

  interface CaseGroup {
    readonly line: number;
    readonly label: string;
    readonly events: JavaBodyEvent[];
  }
  const caseGroups: CaseGroup[] = [];
  for (const group of groups) {
    const switchLabel = childNode(group, 'switchLabel');
    const isDefault = switchLabel ? hasChild(switchLabel, 'Default') : false;
    const caseConstant = switchLabel ? childNode(switchLabel, 'caseConstant') : undefined;
    const label = isDefault ? 'default' : caseConstant ? renderTokensInOrder(caseConstant) : '';
    const groupEvents: JavaBodyEvent[] = [];
    const blockStatements = childNode(group, 'blockStatements');
    if (blockStatements) {
      for (const blockStatement of childNodes(blockStatements, 'blockStatement')) {
        processBlockStatement(blockStatement, groupEvents, depth + 1);
      }
    }
    caseGroups.push({
      line: findFirstToken(group)?.startLine ?? line,
      label,
      events: groupEvents,
    });
  }

  events.push({
    kind: 'switch',
    line,
    conditionText: selector ? renderTokensInOrder(selector) : '',
    caseCount: caseGroups.length,
  });
  for (const group of caseGroups) {
    events.push({
      kind: 'case',
      line: group.line,
      caseLabel: group.label,
      caseEventCount: group.events.length,
    });
    events.push(...group.events);
  }
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
  let hasConditionCall = false;
  if (conditionExpression) {
    const primary = unwrapToPrimary(conditionExpression);
    const call = primary ? describeCallAtPrimary(primary) : undefined;
    const callArgsText = call ? argumentsTextOf(call.argumentList) : '';
    conditionText = call
      ? call.targetName
        ? `${call.targetName}.${call.methodName}(${callArgsText})`
        : `${call.methodName}(${callArgsText})`
      : renderTokensInOrder(conditionExpression);
    // Mirrors exactly what `emitExpressionEvent(conditionExpression, ...)`
    // below will do — so a consumer can tell "the event right after mine
    // is my own condition's call" from "there was no condition-call event
    // at all, so that next event is already the then-branch's first
    // statement" (docs/sprints/SPRINT-9.md; a condition like `!exists`
    // that isn't itself a call, followed by a then-branch that opens with
    // one, e.g. `user.setRole(...)`, was previously misread as the
    // condition's own call — silently dropping the real first then-branch
    // step and throwing off the branch boundary by one event).
    hasConditionCall = call !== undefined;
  }

  // `ifStatement.children.statement` is a 2-element array when an `else`
  // is present — [thenStatement, elseStatement] — the else-branch itself
  // a nested `ifStatement` for an `else if` chain, so recursion into
  // `processIf` composes naturally without special-casing chains
  // (docs/sprints/SPRINT-9.md).
  const statements = childNodes(ifStatement, 'statement');
  const thenStatement = statements[0];
  const hasElse = hasChild(ifStatement, 'Else');
  const elseStatement = hasElse ? statements[1] : undefined;
  const firstThenKind = thenStatement ? firstStatementKindOf(thenStatement) : undefined;

  // Extracted into scratch arrays first (not appended directly) so the
  // 'if' event can record exactly how many of the following events
  // belong to each branch — the flat event list otherwise has no block
  // boundaries, so a caller couldn't tell "part of the then-branch" from
  // "part of the else-branch" from "comes after the if" for a branch
  // that isn't a bare throw/return (docs/sprints/SPRINT-8.md; extended to
  // a real `else` in docs/sprints/SPRINT-9.md).
  const thenEvents: JavaBodyEvent[] = [];
  if (thenStatement) {
    processStatement(thenStatement, thenEvents, depth + 1);
  }
  const elseEvents: JavaBodyEvent[] = [];
  if (elseStatement) {
    processStatement(elseStatement, elseEvents, depth + 1);
  }

  events.push({
    kind: 'if',
    line,
    conditionText,
    guardThrows: firstThenKind === 'throw',
    guardReturns: firstThenKind === 'return',
    hasConditionCall,
    thenEventCount: thenEvents.length,
    ...(hasElse ? { elseEventCount: elseEvents.length } : {}),
  });

  if (conditionExpression) {
    emitExpressionEvent(conditionExpression, events);
  }
  events.push(...thenEvents);
  events.push(...elseEvents);
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

  const forStatement = childNode(statementNode, 'forStatement');
  if (forStatement) {
    processForStatement(forStatement, events, depth);
    return;
  }

  const whileStatement = childNode(statementNode, 'whileStatement');
  if (whileStatement) {
    processWhileStatement(whileStatement, events, depth);
    return;
  }

  const swts = childNode(statementNode, 'statementWithoutTrailingSubstatement');
  if (!swts) {
    // A labeled/synchronized statement — not modeled (bounded scope).
    return;
  }

  const block = childNode(swts, 'block');
  if (block) {
    walkBlock(block, events, depth + 1);
    return;
  }

  const tryStatement = childNode(swts, 'tryStatement');
  if (tryStatement) {
    processTry(tryStatement, events, depth);
    return;
  }

  const doStatement = childNode(swts, 'doStatement');
  if (doStatement) {
    processDoStatement(doStatement, events, depth);
    return;
  }

  const switchStatement = childNode(swts, 'switchStatement');
  if (switchStatement) {
    processSwitch(switchStatement, events, depth);
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
