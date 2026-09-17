import { AnalysisError, err, ok, type Result } from '@flowscope/core';
import type { BegEdgeType, BegSourceLocation } from '@flowscope/graph-schema';
import type { JavaBodyEvent, JavaMethod, JavaProjectFile, JavaType } from '@flowscope/parser-java';
import type { DiscoveredApi } from '@flowscope/parser-spring/api';
import type { BusinessFlow, BusinessFlowEdge, BusinessStep } from './business-flow';
import {
  describeCall,
  describeCase,
  describeCatch,
  describeConstruct,
  describeDecision,
  describeLoop,
  describeReturn,
  describeSwitch,
  describeThrow,
  describeViewReturn,
  domainNounFromType,
  type CallDescription,
} from './naming';
import { buildTypeIndex, pickImplementation, type ProjectTypeIndex } from './type-index';

/**
 * How many hops of same-project method calls get inlined into the flow.
 * Real, non-trivial endpoints routinely chain 3+ hops deep (a controller
 * calling a service that calls another service or a repository, each with
 * its own lookup-or-throw) — a depth of 1 (SPRINT-5.md's original,
 * deliberately conservative choice) was cutting that off entirely and
 * rendering only the top layer, found by surveying real project call
 * chains (docs/sprints/SPRINT-12.md). Generous but not unbounded: a
 * pathological or mutually-recursive call graph is still capped, though
 * `MAX_TOTAL_STEPS` below is the practical limit that actually bites
 * first for any real codebase — `ctx.visited` (keyed by resolved
 * type+method+line) already prevents infinite recursion on a real cycle
 * regardless of this number.
 */
const MAX_INLINE_DEPTH = 8;

/**
 * A hard cap on how many steps one flow can grow to via inlining, checked
 * alongside `MAX_INLINE_DEPTH` — the practical safety valve for a call
 * graph that's wide rather than deep (many sibling calls, each shallow)
 * so a single endpoint can't produce an unbounded, unbrowsable diagram.
 * Once hit, a call that would otherwise inline instead becomes a plain,
 * un-inlined step — visible, just not expanded further (SPRINT-12.md).
 */
const MAX_TOTAL_STEPS = 150;

/** Whether a resolved call is still worth inlining — both depth and total-size budgets must have room. */
function canInlineFurther(ctx: FlowContext, depth: number): boolean {
  return depth < MAX_INLINE_DEPTH && ctx.stepCount < MAX_TOTAL_STEPS;
}

interface PendingEdge {
  readonly type: BegEdgeType;
  readonly label?: string;
}

/**
 * `lastStepId` is "the step whose execution most recently completed on
 * the branch currently being built" — every new step connects from it.
 * `nextEdge` is a one-shot override for *that one* connection (a
 * decision's branch gets `'error'`/`'success'` + a Yes/No label instead
 * of a plain `'sequence'`); it resets to `'sequence'` after each use. A
 * decision's guard-clause branch is built by temporarily leaving
 * `lastStepId` pointed at the decision, then restoring it there
 * afterward so the branch that resumes normal flow also connects from
 * the decision, not from the (dead-end) guard outcome — see `handleIf`.
 */
interface FlowContext {
  readonly typeIndex: ProjectTypeIndex;
  readonly steps: BusinessStep[];
  readonly edges: BusinessFlowEdge[];
  readonly visited: Set<string>;
  lastStepId: string | undefined;
  nextEdge: PendingEdge;
  stepCount: number;
  edgeCount: number;
}

function sourceOf(
  file: string,
  line: number,
  methodName: string,
  className: string,
): BegSourceLocation {
  return { file, lineStart: line, lineEnd: line, method: methodName, className };
}

function connect(ctx: FlowContext, from: string, to: string, edge: PendingEdge): void {
  ctx.edgeCount += 1;
  ctx.edges.push({
    id: `edge-${String(ctx.edgeCount)}`,
    from,
    to,
    type: edge.type,
    ...(edge.label ? { label: edge.label } : {}),
  });
}

/**
 * Creates a step and connects it from `ctx.lastStepId` (if any) using
 * `ctx.nextEdge`, then advances the cursor to the new step. The one
 * function every event handler below pushes new steps through, so
 * branching (see `handleIf`) only has to manipulate `lastStepId`/
 * `nextEdge` rather than every call site knowing about edges.
 */
function addStep(
  ctx: FlowContext,
  description: CallDescription,
  technicalName: string,
  source: BegSourceLocation,
): string {
  ctx.stepCount += 1;
  const id = `step-${String(ctx.stepCount)}`;
  ctx.steps.push({
    id,
    type: description.type,
    businessName: description.businessName,
    businessDescription: description.businessDescription,
    confidence: description.confidence,
    technicalName,
    source,
  });
  if (ctx.lastStepId) {
    connect(ctx, ctx.lastStepId, id, ctx.nextEdge);
  }
  ctx.nextEdge = { type: 'sequence' };
  ctx.lastStepId = id;
  return id;
}

interface CallResolution {
  readonly type: JavaType;
  readonly file: string;
  readonly method: JavaMethod;
  readonly key: string;
}

/**
 * Picks the right overload among same-named methods on a resolved target
 * type. There's no static type information to match parameter *types*
 * against, but argument *count* is enough to tell apart the common case —
 * distinct overloads with distinct arities — and is strictly better than
 * the previous behavior of always taking whichever overload happened to
 * be declared first (docs/sprints/SPRINT-7.md). When the call's own
 * argument count isn't known, or no arity matches, falls back to the
 * first same-named method, same as before.
 */
function selectOverload(
  candidates: readonly JavaMethod[],
  argumentCount: number | undefined,
): JavaMethod | undefined {
  if (candidates.length <= 1 || argumentCount === undefined) {
    return candidates[0];
  }
  return candidates.find((candidate) => candidate.parameterCount === argumentCount) ?? candidates[0];
}

/** Resolves a call's target to a method elsewhere in the parsed project — via a field's declared type for `field.method(...)`, or the owning type itself for a bare `method(...)` self-call. */
function resolveCall(
  targetName: string,
  methodName: string,
  argumentCount: number | undefined,
  ownerType: JavaType,
  ownerFile: string,
  typeIndex: ProjectTypeIndex,
): CallResolution | undefined {
  let targetType = ownerType;
  let targetFile = ownerFile;

  if (targetName) {
    const field = ownerType.fields.find((candidate) => candidate.name === targetName);
    if (!field) {
      return undefined;
    }
    const resolved = typeIndex.byName.get(field.type);
    if (!resolved) {
      return undefined;
    }
    targetType = resolved.type;
    targetFile = resolved.relativePath;
  }

  // A field typed as a service interface (`private CommentService
  // commentService;`) is the standard Spring interface+impl pattern — the
  // interface's own method has no body to follow at all, so redirect to a
  // real implementing class in the project when there is one. No match
  // (an external/framework interface, or one nothing in the project
  // implements) correctly falls through to the plain, non-inlined step
  // below rather than resolving into nothing (docs/sprints/SPRINT-13.md).
  if (targetType.kind === 'interface') {
    const impl = pickImplementation(
      targetType.name,
      typeIndex.implementorsByInterfaceName.get(targetType.name),
    );
    if (!impl) {
      return undefined;
    }
    targetType = impl.type;
    targetFile = impl.relativePath;
  }

  const candidates = targetType.methods.filter((candidate) => candidate.name === methodName);
  const method = selectOverload(candidates, argumentCount);
  if (!method) {
    return undefined;
  }

  return {
    type: targetType,
    file: targetFile,
    method,
    key: `${targetType.name}#${method.name}#${String(method.line)}`,
  };
}

const LOGGER_FIELD_TYPES = new Set(['Logger', 'Log']);
const LOGGER_VARIABLE_NAMES = new Set(['log', 'logger', 'LOG', 'LOGGER']);
const LOGGING_METHOD_NAMES = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'isTraceEnabled',
  'isDebugEnabled',
  'isInfoEnabled',
  'isWarnEnabled',
  'isErrorEnabled',
]);
const CONSOLE_PRINT_TARGETS = new Set(['System.out', 'System.err']);

/**
 * True for a call that's purely diagnostic — a logger statement or a
 * `System.out`/`System.err` print — never real business logic, so it's
 * skipped entirely rather than rendered as a step, per direct request
 * ("leave out the logs... focus on the business logic",
 * docs/sprints/SPRINT-13.md). Two independent signals, either sufficient
 * on its own: the call target being one of the conventional bare names a
 * logger variable is given (`log`/`logger`/`LOG`/`LOGGER` — this one
 * matters most in practice, since Lombok's `@Slf4j` synthesizes the `log`
 * field at compile time, so it never appears in the parsed source for a
 * field-type check to catch), or an explicitly declared field typed
 * `Logger`/`Log` under an unconventional name. Gated on a recognized
 * logging method name too, so a field that happens to be named `log` for
 * some other reason doesn't lose an unrelated method call.
 */
function isLoggingCall(targetName: string, methodName: string, ownerType: JavaType): boolean {
  if (CONSOLE_PRINT_TARGETS.has(targetName)) {
    return true;
  }
  if (!targetName || !LOGGING_METHOD_NAMES.has(methodName)) {
    return false;
  }
  if (LOGGER_VARIABLE_NAMES.has(targetName)) {
    return true;
  }
  const field = ownerType.fields.find((candidate) => candidate.name === targetName);
  return field !== undefined && LOGGER_FIELD_TYPES.has(field.type);
}

function handleCall(
  event: JavaBodyEvent,
  ownerType: JavaType,
  ownerFile: string,
  method: JavaMethod,
  depth: number,
  noun: string,
  ctx: FlowContext,
): void {
  const targetName = event.targetName ?? '';
  const methodName = event.methodName ?? '';
  if (!methodName || isLoggingCall(targetName, methodName, ownerType)) {
    return;
  }

  const resolution = resolveCall(
    targetName,
    methodName,
    event.argumentCount,
    ownerType,
    ownerFile,
    ctx.typeIndex,
  );
  if (resolution && canInlineFurther(ctx, depth) && !ctx.visited.has(resolution.key)) {
    ctx.visited.add(resolution.key);
    unroll(resolution.type, resolution.file, resolution.method, depth + 1, ctx);
    return;
  }

  const description = describeCall(methodName, noun, event.firstStringArgument);
  const args = event.argumentsText ?? '';
  const technicalName = targetName ? `${targetName}.${methodName}(${args})` : `${methodName}(${args})`;
  addStep(
    ctx,
    description,
    technicalName,
    sourceOf(ownerFile, event.line, method.name, ownerType.name),
  );
}

/**
 * Resolves what a `return` statement's expression evaluates to as a
 * string literal, if it does at all: either the literal directly
 * (`event.returnsStringLiteral`), or — the classic
 * `private static final String VIEW = "...";` idiom — a bare identifier
 * that names a `static final String` constant on the owning type
 * (docs/sprints/SPRINT-7.md; found in the user's real AdminController,
 * whose `return REDIRECT_ADMIN_PRODUCTS;` previously fell all the way
 * through to a generic "Return Response" step).
 */
function resolvedReturnLiteral(event: JavaBodyEvent, ownerType: JavaType): string | undefined {
  if (event.returnsStringLiteral !== undefined) {
    return event.returnsStringLiteral;
  }
  if (event.returnsIdentifier === undefined) {
    return undefined;
  }
  return ownerType.fields.find((field) => field.name === event.returnsIdentifier)?.stringConstantValue;
}

function returnLiteralTechnicalName(event: JavaBodyEvent, literal: string): string {
  return event.returnsStringLiteral !== undefined
    ? `return "${literal}"`
    : `return ${event.returnsIdentifier ?? ''} /* "${literal}" */`;
}

function handleReturn(
  event: JavaBodyEvent,
  ownerType: JavaType,
  ownerFile: string,
  method: JavaMethod,
  depth: number,
  noun: string,
  ctx: FlowContext,
): void {
  const literal = resolvedReturnLiteral(event, ownerType);

  if (depth === 0) {
    // A call nested as the outer return-call's first argument — e.g.
    // `bookingService.createBooking(request)` inside `return
    // ResponseEntity.ok(bookingService.createBooking(request));` — is
    // resolved and inlined *before* the outer wrapper step below, the
    // same way any other call is: a single-expression-body controller
    // method (the single most common real Spring MVC shape) otherwise
    // has its actual business call completely invisible, only the outer
    // wrapper (`ResponseEntity.ok`) ever showing up (docs/sprints/SPRINT-12.md).
    if (literal === undefined && event.returnsNestedCallMethod !== undefined) {
      const nestedTargetName = event.returnsNestedCallTarget ?? '';
      const nestedMethodName = event.returnsNestedCallMethod;
      const resolution = resolveCall(
        nestedTargetName,
        nestedMethodName,
        event.returnsNestedCallArgumentCount,
        ownerType,
        ownerFile,
        ctx.typeIndex,
      );
      if (resolution && canInlineFurther(ctx, depth) && !ctx.visited.has(resolution.key)) {
        ctx.visited.add(resolution.key);
        unroll(resolution.type, resolution.file, resolution.method, depth + 1, ctx);
      } else {
        const nestedDescription = describeCall(nestedMethodName, noun);
        const nestedArgs = event.returnsNestedCallArgumentsText ?? '';
        addStep(
          ctx,
          nestedDescription,
          nestedTargetName
            ? `${nestedTargetName}.${nestedMethodName}(${nestedArgs})`
            : `${nestedMethodName}(${nestedArgs})`,
          sourceOf(ownerFile, event.line, method.name, ownerType.name),
        );
      }
    }

    const description =
      literal !== undefined
        ? describeViewReturn(literal)
        : describeReturn(event.returnsCallTarget, event.returnsCallMethod);
    const returnArgs = event.returnsCallArgumentsText ?? '';
    const technicalName =
      literal !== undefined
        ? returnLiteralTechnicalName(event, literal)
        : event.returnsCallTarget
          ? `return ${event.returnsCallTarget}.${event.returnsCallMethod ?? ''}(${returnArgs})`
          : event.returnsCallMethod
            ? `return ${event.returnsCallMethod}(${returnArgs})`
            : 'return ...';
    addStep(
      ctx,
      description,
      technicalName,
      sourceOf(ownerFile, event.line, method.name, ownerType.name),
    );
    return;
  }

  if (literal !== undefined) {
    addStep(
      ctx,
      describeViewReturn(literal),
      returnLiteralTechnicalName(event, literal),
      sourceOf(ownerFile, event.line, method.name, ownerType.name),
    );
    return;
  }

  if (!event.returnsCallTarget && !event.returnsCallMethod) {
    // A bare `return someLocal;` inside an inlined callee adds no new
    // business information (whatever produced `someLocal` already has
    // its own step) — skip rather than emit noise.
    return;
  }

  const targetName = event.returnsCallTarget ?? '';
  const methodName = event.returnsCallMethod ?? '';
  // The return-expression call shape doesn't capture an argument count
  // (unlike a statement-level `call` event), so an overload here always
  // falls back to the first same-named candidate — see `selectOverload`.
  const resolution = resolveCall(targetName, methodName, undefined, ownerType, ownerFile, ctx.typeIndex);
  if (resolution && canInlineFurther(ctx, depth) && !ctx.visited.has(resolution.key)) {
    ctx.visited.add(resolution.key);
    unroll(resolution.type, resolution.file, resolution.method, depth + 1, ctx);
    return;
  }

  const description = describeCall(methodName, noun);
  const returnCallArgs = event.returnsCallArgumentsText ?? '';
  const technicalName = targetName
    ? `${targetName}.${methodName}(${returnCallArgs})`
    : `${methodName}(${returnCallArgs})`;
  addStep(
    ctx,
    description,
    technicalName,
    sourceOf(ownerFile, event.line, method.name, ownerType.name),
  );
}

/** True for an event kind that ends the method's flow outright — used to decide whether a branch needs a "resume normal flow" cursor after it, or is a genuine dead end. */
function isTerminalEvent(event: JavaBodyEvent | undefined): boolean {
  return event?.kind === 'throw' || event?.kind === 'return';
}

/**
 * The one place a real branch gets built: a decision step, followed by
 * its guard-clause outcome (`throw`/early `return`) wired as one branch,
 * with the code that resumes normal flow wired as the *other* branch —
 * both hanging directly off the decision, not off each other, so the
 * result is an actual diamond, not a flattened chain
 * (docs/sprints/SPRINT-6.md). Extended in docs/sprints/SPRINT-9.md to a
 * real `else` branch: both branches hang off the decision with their own
 * steps: whichever branch doesn't end in a throw/return is where
 * whatever code follows the whole `if`/`else` resumes from (the flat
 * single-cursor model can only continue from one place, so when *both*
 * branches fall through — unusual, but possible — the `else` branch's
 * tail arbitrarily wins; documented in SPRINT-9.md).
 */
function handleIf(
  events: readonly JavaBodyEvent[],
  index: number,
  ownerType: JavaType,
  ownerFile: string,
  method: JavaMethod,
  depth: number,
  noun: string,
  ctx: FlowContext,
): number {
  const ifEvent = events[index];
  if (!ifEvent) {
    return index + 1;
  }
  let next = index + 1;

  // `hasConditionCall` (not "is the next event call-shaped") is the only
  // reliable signal here: a condition that isn't itself a call (e.g.
  // `!exists`) pushes no condition-call event at all, so `events[next]`
  // is already the then-branch's first statement — which could easily
  // itself be call-shaped (e.g. `user.setRole(...)`) and get misread as
  // the condition's own call otherwise (docs/sprints/SPRINT-9.md).
  let conditionCall: { readonly targetName: string; readonly methodName: string } | undefined;
  if (ifEvent.hasConditionCall) {
    const callEvent = events[next];
    if (callEvent && callEvent.kind === 'call') {
      conditionCall = {
        targetName: callEvent.targetName ?? '',
        methodName: callEvent.methodName ?? '',
      };
      next += 1;
    }
  }

  const decision = describeDecision(ifEvent.conditionText ?? '', conditionCall, noun);
  const decisionId = addStep(
    ctx,
    decision,
    ifEvent.conditionText || 'if (...)',
    sourceOf(ownerFile, ifEvent.line, method.name, ownerType.name),
  );

  // "Yes" answers the phrased question, not necessarily "the raw Java
  // condition was true" — see DecisionDescription.affirmativeBranch.
  const guardLabel = decision.affirmativeBranch === 'guard' ? 'Yes' : 'No';
  const continueLabel = decision.affirmativeBranch === 'guard' ? 'No' : 'Yes';

  // How many of the events starting at `next` belong to the then-branch,
  // and (when a real `else` is present) the else-branch right after it —
  // covers any branch shape, not just a bare throw/return (SPRINT-8.md),
  // extended to `else` in SPRINT-9.md; see `JavaBodyEvent.thenEventCount`/
  // `elseEventCount`.
  const thenEventCount = ifEvent.thenEventCount ?? 0;
  const thenEnd = next + thenEventCount;
  const hasElse = ifEvent.elseEventCount !== undefined;

  let thenTailId: string | undefined;
  if (thenEventCount > 0) {
    // A throw/return guard is a dead end (the branch exits the method);
    // anything else is a conditional side effect. With no `else`, that
    // side effect falls through to the same continuation as the other
    // branch — the flat single-cursor model can't represent that merge,
    // so what follows the `if` is drawn resuming only from the
    // decision's continue edge below (found via a real no-else `if`
    // whose body just set a value and fell through). With a real `else`,
    // see below.
    const branchEdgeType = ifEvent.guardThrows || ifEvent.guardReturns ? 'error' : 'conditional';
    ctx.nextEdge = { type: branchEdgeType, label: guardLabel };
    let i = next;
    while (i < thenEnd) {
      i = processEventAt(events, i, ownerType, ownerFile, method, depth, noun, ctx);
    }
    thenTailId = ctx.lastStepId;
  }

  if (hasElse) {
    const elseEventCount = ifEvent.elseEventCount ?? 0;
    const elseEnd = thenEnd + elseEventCount;

    ctx.lastStepId = decisionId;
    let elseTailId: string | undefined = decisionId;
    if (elseEventCount > 0) {
      ctx.nextEdge = { type: 'conditional', label: continueLabel };
      let i = thenEnd;
      while (i < elseEnd) {
        i = processEventAt(events, i, ownerType, ownerFile, method, depth, noun, ctx);
      }
      elseTailId = ctx.lastStepId;
    }

    // Whichever branch doesn't end the method is where anything after
    // the whole if/else resumes from; if both do, nothing should follow
    // in well-formed code, so the decision is a harmless default. An
    // empty branch is never terminal — it's a no-op that falls straight
    // through.
    const thenEndsMethod = thenEventCount > 0 && isTerminalEvent(events[thenEnd - 1]);
    const elseEndsMethod = elseEventCount > 0 && isTerminalEvent(events[elseEnd - 1]);
    ctx.lastStepId = !elseEndsMethod ? elseTailId : !thenEndsMethod ? thenTailId : decisionId;
    ctx.nextEdge = { type: 'sequence' };
    return elseEnd;
  }

  // Resume the branch that continues normal flow — from the decision,
  // discarding wherever the guard branch's cursor ended (it's a dead end).
  ctx.lastStepId = decisionId;
  ctx.nextEdge = { type: 'success', label: continueLabel };

  return thenEnd;
}

/**
 * `try`/`catch`'s counterpart to `handleIf`: no natural "decision" step
 * exists here (there's no condition to phrase as a business question), so
 * each catch clause's steps hang directly off whatever step preceded the
 * whole `try` — the same point the try-block's own first step connects
 * from — via an `'error'` edge labeled with the caught exception type. A
 * synthetic step is always added for entering each catch clause itself
 * (`describeCatch`), so even a trivial catch body ("log and continue") is
 * still visible as its own real node — the "this call can fail this way"
 * signal matters even when the handler is trivial. Where code after the
 * whole `try`/`catch` resumes from follows the same merge-point rule as
 * `handleIf`'s: whichever branch (the try-block, or the first catch
 * clause in source order) doesn't end the method
 * (docs/sprints/SPRINT-12.md).
 */
function handleTry(
  events: readonly JavaBodyEvent[],
  index: number,
  ownerType: JavaType,
  ownerFile: string,
  method: JavaMethod,
  depth: number,
  noun: string,
  ctx: FlowContext,
): number {
  const tryEvent = events[index];
  if (!tryEvent) {
    return index + 1;
  }
  const next = index + 1;
  const preTryStepId = ctx.lastStepId;

  // `ctx.nextEdge` is already correctly set for wherever the try-block's
  // own first step should connect from (whatever was active when this
  // `'try'` event was reached) — no need to touch it before processing
  // the try-block itself.
  const tryEventCount = tryEvent.tryEventCount ?? 0;
  const tryEnd = next + tryEventCount;
  let tryTailId: string | undefined = preTryStepId;
  let tryEndsMethod = false;
  if (tryEventCount > 0) {
    let i = next;
    while (i < tryEnd) {
      i = processEventAt(events, i, ownerType, ownerFile, method, depth, noun, ctx);
    }
    tryTailId = ctx.lastStepId;
    tryEndsMethod = isTerminalEvent(events[tryEnd - 1]);
  }

  let cursor = tryEnd;
  const catchCount = tryEvent.catchCount ?? 0;
  const catchTails: { readonly id: string | undefined; readonly endsMethod: boolean }[] = [];
  for (let c = 0; c < catchCount; c += 1) {
    const catchEvent = events[cursor];
    cursor += 1;
    if (!catchEvent) {
      break;
    }
    const exceptionType = catchEvent.exceptionType ?? 'Exception';
    ctx.lastStepId = preTryStepId;
    ctx.nextEdge = { type: 'error', label: exceptionType };
    addStep(
      ctx,
      describeCatch(exceptionType),
      `catch (${exceptionType} e)`,
      sourceOf(ownerFile, catchEvent.line, method.name, ownerType.name),
    );

    const catchEventCount = catchEvent.catchEventCount ?? 0;
    const catchEnd = cursor + catchEventCount;
    if (catchEventCount > 0) {
      let j = cursor;
      while (j < catchEnd) {
        j = processEventAt(events, j, ownerType, ownerFile, method, depth, noun, ctx);
      }
    }
    catchTails.push({
      id: ctx.lastStepId,
      endsMethod: catchEventCount > 0 && isTerminalEvent(events[catchEnd - 1]),
    });
    cursor = catchEnd;
  }

  // Merge point, same reasoning as handleIf's: prefer the try-block's own
  // tail if it doesn't end the method, else the first catch clause that
  // doesn't either, else fall back to the pre-try step as a harmless
  // default (nothing should follow in well-formed code at that point).
  ctx.nextEdge = { type: 'sequence' };
  if (!tryEndsMethod) {
    ctx.lastStepId = tryTailId;
  } else {
    const firstNonTerminalCatch = catchTails.find((c) => !c.endsMethod);
    ctx.lastStepId = firstNonTerminalCatch ? firstNonTerminalCatch.id : preTryStepId;
  }

  return cursor;
}

/**
 * A loop's body walked exactly once — "this happens for each iteration",
 * the same honest framing `JavaBodyEvent.loopEventCount`'s doc comment
 * describes — connected sequentially from the loop-entry step via a
 * `'loop'`-type edge (the schema already had this edge type; SPRINT-13.md
 * is the first thing to use it). Unlike `handleIf`/`handleTry`, there's no
 * branching here at all: a single pass through the body, so whatever
 * follows the loop simply resumes from the body's own tail — no
 * merge-point logic needed (docs/sprints/SPRINT-13.md).
 */
function handleLoop(
  events: readonly JavaBodyEvent[],
  index: number,
  ownerType: JavaType,
  ownerFile: string,
  method: JavaMethod,
  depth: number,
  noun: string,
  ctx: FlowContext,
): number {
  const loopEvent = events[index];
  if (!loopEvent) {
    return index + 1;
  }
  const next = index + 1;

  const description = describeLoop(loopEvent.loopVariableType, loopEvent.conditionText ?? '');
  addStep(
    ctx,
    description,
    loopEvent.conditionText || 'loop (...)',
    sourceOf(ownerFile, loopEvent.line, method.name, ownerType.name),
  );

  const loopEventCount = loopEvent.loopEventCount ?? 0;
  const bodyEnd = next + loopEventCount;
  if (loopEventCount > 0) {
    ctx.nextEdge = { type: 'loop' };
    let i = next;
    while (i < bodyEnd) {
      i = processEventAt(events, i, ownerType, ownerFile, method, depth, noun, ctx);
    }
  }

  return bodyEnd;
}

/**
 * A `switch`'s counterpart to `handleTry`: one entry step for the switched
 * expression, then every `case`/`default` label hangs its own steps
 * directly off that entry step (an N-way branch, same layout as `try`'s
 * catch clauses), labeled with the case's own value on a `'conditional'`
 * edge. The same "whichever branch doesn't end the method is where
 * trailing code resumes from" merge-point rule applies, generalized from
 * `try`/`catch`'s N exception types to N case labels
 * (docs/sprints/SPRINT-13.md). A case that falls through into the next
 * without a `break` has no special handling — its body is simply empty
 * (`caseEventCount: 0`), and the next label's own steps hang off the
 * switch entry exactly the same way, not chained after the empty one.
 */
function handleSwitch(
  events: readonly JavaBodyEvent[],
  index: number,
  ownerType: JavaType,
  ownerFile: string,
  method: JavaMethod,
  depth: number,
  noun: string,
  ctx: FlowContext,
): number {
  const switchEvent = events[index];
  if (!switchEvent) {
    return index + 1;
  }
  let cursor = index + 1;

  const description = describeSwitch(switchEvent.conditionText ?? '');
  const switchStepId = addStep(
    ctx,
    description,
    switchEvent.conditionText || 'switch (...)',
    sourceOf(ownerFile, switchEvent.line, method.name, ownerType.name),
  );

  const caseCount = switchEvent.caseCount ?? 0;
  const caseTails: { readonly id: string | undefined; readonly endsMethod: boolean }[] = [];
  for (let c = 0; c < caseCount; c += 1) {
    const caseEvent = events[cursor];
    cursor += 1;
    if (!caseEvent) {
      break;
    }
    const label = caseEvent.caseLabel ?? '';
    ctx.lastStepId = switchStepId;
    ctx.nextEdge = { type: 'conditional', label: label === 'default' || !label ? 'Otherwise' : label };
    addStep(
      ctx,
      describeCase(label),
      label === 'default' || !label ? 'default:' : `case ${label}:`,
      sourceOf(ownerFile, caseEvent.line, method.name, ownerType.name),
    );

    const caseEventCount = caseEvent.caseEventCount ?? 0;
    const caseEnd = cursor + caseEventCount;
    if (caseEventCount > 0) {
      let j = cursor;
      while (j < caseEnd) {
        j = processEventAt(events, j, ownerType, ownerFile, method, depth, noun, ctx);
      }
    }
    caseTails.push({
      id: ctx.lastStepId,
      endsMethod: caseEventCount > 0 && isTerminalEvent(events[caseEnd - 1]),
    });
    cursor = caseEnd;
  }

  ctx.nextEdge = { type: 'sequence' };
  const firstNonTerminalCase = caseTails.find((c) => !c.endsMethod);
  ctx.lastStepId = firstNonTerminalCase ? firstNonTerminalCase.id : switchStepId;

  return cursor;
}

/** Dispatches one body event by kind, advancing the flow — shared by `unroll`'s top-level loop and `handleIf`'s branch walks so a nested `if` composes naturally through the same recursion. */
function processEventAt(
  events: readonly JavaBodyEvent[],
  index: number,
  ownerType: JavaType,
  ownerFile: string,
  method: JavaMethod,
  depth: number,
  noun: string,
  ctx: FlowContext,
): number {
  const event = events[index];
  if (!event) {
    return index + 1;
  }

  if (event.kind === 'if') {
    return handleIf(events, index, ownerType, ownerFile, method, depth, noun, ctx);
  }
  if (event.kind === 'try') {
    return handleTry(events, index, ownerType, ownerFile, method, depth, noun, ctx);
  }
  if (event.kind === 'loop') {
    return handleLoop(events, index, ownerType, ownerFile, method, depth, noun, ctx);
  }
  if (event.kind === 'switch') {
    return handleSwitch(events, index, ownerType, ownerFile, method, depth, noun, ctx);
  }
  if (event.kind === 'catch' || event.kind === 'case') {
    // Never reached as a top-level "current" event in well-formed output —
    // handleTry/handleSwitch always consume every 'catch'/'case' event
    // themselves via their own index arithmetic. Advance past it
    // defensively rather than mis-dispatching to handleReturn below if
    // that invariant is ever violated (docs/sprints/SPRINT-12.md,
    // extended in docs/sprints/SPRINT-13.md).
    return index + 1;
  }
  if (event.kind === 'call') {
    handleCall(event, ownerType, ownerFile, method, depth, noun, ctx);
    return index + 1;
  }
  if (event.kind === 'construct') {
    const description = describeConstruct(event.methodName ?? 'Object', Boolean(event.looksGenerated));
    addStep(
      ctx,
      description,
      `new ${event.methodName ?? 'Object'}(${event.argumentsText ?? ''})`,
      sourceOf(ownerFile, event.line, method.name, ownerType.name),
    );
    return index + 1;
  }
  if (event.kind === 'throw') {
    const description = describeThrow(event.exceptionType ?? 'Exception', noun, event.exceptionMessage);
    addStep(
      ctx,
      description,
      `throw new ${event.exceptionType ?? 'Exception'}(${event.argumentsText ?? ''})`,
      sourceOf(ownerFile, event.line, method.name, ownerType.name),
    );
    return index + 1;
  }
  // Only 'return' remains among JavaBodyEventKind's variants at this point.
  handleReturn(event, ownerType, ownerFile, method, depth, noun, ctx);
  return index + 1;
}

function unroll(
  ownerType: JavaType,
  ownerFile: string,
  method: JavaMethod,
  depth: number,
  ctx: FlowContext,
): void {
  const noun = domainNounFromType(ownerType.name);
  const events = method.bodyEvents;
  let index = 0;

  while (index < events.length) {
    index = processEventAt(events, index, ownerType, ownerFile, method, depth, noun, ctx);
  }
}

const HTTP_VERB_FALLBACK_NAME: Readonly<Record<string, (noun: string) => string>> = {
  GET: (noun) => `Find ${noun}`,
  POST: (noun) => `Create ${noun}`,
  PUT: (noun) => `Update ${noun}`,
  PATCH: (noun) => `Update ${noun}`,
  DELETE: (noun) => `Delete ${noun}`,
};

/** Describes the flow's very first step — the API operation itself, always a strong, directly-annotated signal (confidence never below 0.85). */
function describeApiEntry(api: DiscoveredApi, noun: string): CallDescription {
  const byMethodName = describeCall(api.methodName, noun);
  if (byMethodName.confidence >= 0.6) {
    return { ...byMethodName, confidence: Math.max(byMethodName.confidence, 0.85) };
  }
  return {
    type: 'business-step',
    businessName: HTTP_VERB_FALLBACK_NAME[api.httpMethod]?.(noun) ?? byMethodName.businessName,
    businessDescription: `Handles ${api.httpMethod} ${api.path}.`,
    confidence: 0.85,
  };
}

/**
 * Infers a confidence-scored business flow for one discovered API — the
 * whole point of `packages/business-analyzer` (docs/sprints/SPRINT-5.md).
 * The result is a real branching graph, not a flattened list: a decision
 * step's guard-clause outcome and its normal-flow continuation both
 * connect directly from the decision (docs/sprints/SPRINT-6.md).
 * `projectFiles` should be every file `packages/parser-java`'s
 * `parseJavaFiles` could reach (normally the same `main`/`other`
 * source-set files a prior scan/discovery already parsed), so the API's
 * own controller method — and whatever same-project bean it calls one
 * level deep — can be found.
 */
export function inferBusinessFlow(
  api: DiscoveredApi,
  projectFiles: readonly JavaProjectFile[],
): Result<BusinessFlow, AnalysisError> {
  const entryFile = projectFiles.find((file) => file.relativePath === api.file);
  const entryType = entryFile?.model.types.find((type) => type.name === api.className);
  // Matched by declaration line, not just name, when more than one
  // method shares it: two `@GetMapping`/`@PostMapping` handlers sharing a
  // name (e.g. a form-showing `addProduct()` and a form-submitting
  // `addProduct(...)` overload) are an ordinary Spring MVC pattern, and
  // `api.line` — captured from this exact method at discovery time
  // (discover-apis-in-file.ts) — is the only way to tell them apart
  // (docs/sprints/SPRINT-7.md; found by reading the user's real
  // E-commerce-project-springBoot controller). Falls back to the first
  // same-named method when no line matches, so a caller that doesn't
  // have precise line info (a hand-built `DiscoveredApi`, say) still
  // resolves the unambiguous, non-overloaded case.
  const entryCandidates = entryType?.methods.filter((candidate) => candidate.name === api.methodName) ?? [];
  const entryMethod =
    entryCandidates.find((candidate) => candidate.line === api.line) ?? entryCandidates[0];

  if (!entryFile || !entryType || !entryMethod) {
    return err(
      new AnalysisError({
        message: `Could not locate ${api.className}.${api.methodName} in "${api.file}" to infer its business flow.`,
        context: {
          apiId: api.id,
          file: api.file,
          className: api.className,
          methodName: api.methodName,
        },
      }),
    );
  }

  const ctx: FlowContext = {
    typeIndex: buildTypeIndex(projectFiles),
    steps: [],
    edges: [],
    visited: new Set([`${entryType.name}#${entryMethod.name}#${String(entryMethod.line)}`]),
    lastStepId: undefined,
    nextEdge: { type: 'sequence' },
    stepCount: 0,
    edgeCount: 0,
  };

  const noun = domainNounFromType(entryType.name);
  addStep(
    ctx,
    describeApiEntry(api, noun),
    `${api.className}.${api.methodName}()`,
    sourceOf(api.file, api.line, api.methodName, api.className),
  );

  unroll(entryType, api.file, entryMethod, 0, ctx);

  return ok({ apiId: api.id, steps: ctx.steps, edges: ctx.edges });
}
