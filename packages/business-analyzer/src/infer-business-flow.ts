import { AnalysisError, err, ok, type Result } from '@flowscope/core';
import type { BegEdgeType, BegSourceLocation } from '@flowscope/graph-schema';
import type { JavaBodyEvent, JavaMethod, JavaProjectFile, JavaType } from '@flowscope/parser-java';
import type { DiscoveredApi } from '@flowscope/parser-spring/api';
import type { BusinessFlow, BusinessFlowEdge, BusinessStep } from './business-flow';
import {
  describeCall,
  describeConstruct,
  describeDecision,
  describeReturn,
  describeThrow,
  describeViewReturn,
  domainNounFromType,
  type CallDescription,
} from './naming';
import { buildTypeIndex, type TypeIndexEntry } from './type-index';

/**
 * How many hops of same-project method calls get inlined into the flow —
 * the controller's direct callee, no further (docs/sprints/SPRINT-5.md's
 * "Explicitly deferred"). A call beyond this depth, or one that doesn't
 * resolve to a project type at all, still becomes a step — just not
 * unrolled into its own callee's steps.
 */
const MAX_INLINE_DEPTH = 1;

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
  readonly typeIndex: ReadonlyMap<string, TypeIndexEntry>;
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
  typeIndex: ReadonlyMap<string, TypeIndexEntry>,
): CallResolution | undefined {
  let targetType = ownerType;
  let targetFile = ownerFile;

  if (targetName) {
    const field = ownerType.fields.find((candidate) => candidate.name === targetName);
    if (!field) {
      return undefined;
    }
    const resolved = typeIndex.get(field.type);
    if (!resolved) {
      return undefined;
    }
    targetType = resolved.type;
    targetFile = resolved.relativePath;
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
  if (!methodName) {
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
  if (resolution && depth < MAX_INLINE_DEPTH && !ctx.visited.has(resolution.key)) {
    ctx.visited.add(resolution.key);
    unroll(resolution.type, resolution.file, resolution.method, depth + 1, ctx);
    return;
  }

  const description = describeCall(methodName, noun, event.firstStringArgument);
  const technicalName = targetName ? `${targetName}.${methodName}(...)` : `${methodName}(...)`;
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
    const description =
      literal !== undefined
        ? describeViewReturn(literal)
        : describeReturn(event.returnsCallTarget, event.returnsCallMethod);
    const technicalName =
      literal !== undefined
        ? returnLiteralTechnicalName(event, literal)
        : event.returnsCallTarget
          ? `return ${event.returnsCallTarget}.${event.returnsCallMethod ?? ''}(...)`
          : event.returnsCallMethod
            ? `return ${event.returnsCallMethod}(...)`
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
  if (resolution && depth < MAX_INLINE_DEPTH && !ctx.visited.has(resolution.key)) {
    ctx.visited.add(resolution.key);
    unroll(resolution.type, resolution.file, resolution.method, depth + 1, ctx);
    return;
  }

  const description = describeCall(methodName, noun);
  const technicalName = targetName ? `${targetName}.${methodName}(...)` : `${methodName}(...)`;
  addStep(
    ctx,
    description,
    technicalName,
    sourceOf(ownerFile, event.line, method.name, ownerType.name),
  );
}

/**
 * The one place a real branch gets built: a decision step, followed by
 * its guard-clause outcome (`throw`/early `return`) wired as one branch,
 * with the code that resumes normal flow wired as the *other* branch —
 * both hanging directly off the decision, not off each other, so the
 * result is an actual diamond, not a flattened chain
 * (docs/sprints/SPRINT-6.md).
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

  let conditionCall: { readonly targetName: string; readonly methodName: string } | undefined;
  const maybeCall = events[next];
  if (maybeCall && maybeCall.kind === 'call') {
    conditionCall = {
      targetName: maybeCall.targetName ?? '',
      methodName: maybeCall.methodName ?? '',
    };
    next += 1;
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

  // How many of the events starting at `next` belong to the then-branch —
  // covers any then-branch (not just a bare throw/return) since
  // SPRINT-8.md; see `JavaBodyEvent.thenEventCount`.
  const thenEventCount = ifEvent.thenEventCount ?? 0;
  const thenEnd = next + thenEventCount;

  if (thenEventCount > 0) {
    // A throw/return guard is a dead end (the branch exits the method);
    // anything else is a conditional side effect that falls through to
    // the same continuation as the other branch — the flat single-cursor
    // model can't represent that merge, so (like the guard case) what
    // follows the `if` is drawn resuming only from the decision's
    // continue edge below. Still a real improvement over the previous
    // behavior, which absorbed the then-branch's own steps into that
    // continue edge unconditionally and mislabeled them (found via a
    // real no-else `if` whose body just set a value and fell through).
    const branchEdgeType = ifEvent.guardThrows || ifEvent.guardReturns ? 'error' : 'conditional';
    ctx.nextEdge = { type: branchEdgeType, label: guardLabel };
    let i = next;
    while (i < thenEnd) {
      i = processEventAt(events, i, ownerType, ownerFile, method, depth, noun, ctx);
    }
  }

  // Resume the branch that continues normal flow — from the decision,
  // discarding wherever the guard branch's cursor ended (it's a dead end).
  ctx.lastStepId = decisionId;
  ctx.nextEdge = { type: 'success', label: continueLabel };

  return thenEnd;
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
  if (event.kind === 'call') {
    handleCall(event, ownerType, ownerFile, method, depth, noun, ctx);
    return index + 1;
  }
  if (event.kind === 'construct') {
    const description = describeConstruct(event.methodName ?? 'Object', Boolean(event.looksGenerated));
    addStep(
      ctx,
      description,
      `new ${event.methodName ?? 'Object'}(...)`,
      sourceOf(ownerFile, event.line, method.name, ownerType.name),
    );
    return index + 1;
  }
  if (event.kind === 'throw') {
    const description = describeThrow(event.exceptionType ?? 'Exception', noun, event.exceptionMessage);
    addStep(
      ctx,
      description,
      `throw ${event.exceptionType ?? 'Exception'}`,
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
