import { AnalysisError, err, ok, type Result } from '@flowscope/core';
import type { BegEdgeType, BegSourceLocation } from '@flowscope/graph-schema';
import type { JavaBodyEvent, JavaMethod, JavaProjectFile, JavaType } from '@flowscope/parser-java';
import type { DiscoveredApi } from '@flowscope/parser-spring/api';
import type { BusinessFlow, BusinessStep } from './business-flow';
import {
  describeCall,
  describeConstruct,
  describeDecision,
  describeReturn,
  describeThrow,
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

interface FlowContext {
  readonly typeIndex: ReadonlyMap<string, TypeIndexEntry>;
  readonly steps: BusinessStep[];
  readonly visited: Set<string>;
  nextEdgeType: BegEdgeType;
  stepCount: number;
}

function sourceOf(
  file: string,
  line: number,
  methodName: string,
  className: string,
): BegSourceLocation {
  return { file, lineStart: line, lineEnd: line, method: methodName, className };
}

function pushStep(
  ctx: FlowContext,
  description: CallDescription,
  technicalName: string,
  source: BegSourceLocation,
): void {
  ctx.stepCount += 1;
  ctx.steps.push({
    id: `step-${String(ctx.stepCount)}`,
    type: description.type,
    businessName: description.businessName,
    businessDescription: description.businessDescription,
    confidence: description.confidence,
    technicalName,
    source,
    incomingEdgeType: ctx.nextEdgeType,
  });
  ctx.nextEdgeType = 'sequence';
}

interface CallResolution {
  readonly type: JavaType;
  readonly file: string;
  readonly method: JavaMethod;
  readonly key: string;
}

/** Resolves a call's target to a method elsewhere in the parsed project — via a field's declared type for `field.method(...)`, or the owning type itself for a bare `method(...)` self-call. */
function resolveCall(
  targetName: string,
  methodName: string,
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

  const method = targetType.methods.find((candidate) => candidate.name === methodName);
  if (!method) {
    return undefined;
  }

  return { type: targetType, file: targetFile, method, key: `${targetType.name}#${method.name}` };
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

  const resolution = resolveCall(targetName, methodName, ownerType, ownerFile, ctx.typeIndex);
  if (resolution && depth < MAX_INLINE_DEPTH && !ctx.visited.has(resolution.key)) {
    ctx.visited.add(resolution.key);
    unroll(resolution.type, resolution.file, resolution.method, depth + 1, ctx);
    return;
  }

  const description = describeCall(methodName, noun);
  const technicalName = targetName ? `${targetName}.${methodName}(...)` : `${methodName}(...)`;
  pushStep(
    ctx,
    description,
    technicalName,
    sourceOf(ownerFile, event.line, method.name, ownerType.name),
  );
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
  if (depth === 0) {
    const description = describeReturn(event.returnsCallTarget, event.returnsCallMethod);
    const technicalName = event.returnsCallTarget
      ? `return ${event.returnsCallTarget}.${event.returnsCallMethod ?? ''}(...)`
      : event.returnsCallMethod
        ? `return ${event.returnsCallMethod}(...)`
        : 'return ...';
    pushStep(
      ctx,
      description,
      technicalName,
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
  const resolution = resolveCall(targetName, methodName, ownerType, ownerFile, ctx.typeIndex);
  if (resolution && depth < MAX_INLINE_DEPTH && !ctx.visited.has(resolution.key)) {
    ctx.visited.add(resolution.key);
    unroll(resolution.type, resolution.file, resolution.method, depth + 1, ctx);
    return;
  }

  const description = describeCall(methodName, noun);
  const technicalName = targetName ? `${targetName}.${methodName}(...)` : `${methodName}(...)`;
  pushStep(
    ctx,
    description,
    technicalName,
    sourceOf(ownerFile, event.line, method.name, ownerType.name),
  );
}

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
  pushStep(
    ctx,
    decision,
    ifEvent.conditionText || 'if (...)',
    sourceOf(ownerFile, ifEvent.line, method.name, ownerType.name),
  );

  if (ifEvent.guardThrows) {
    const throwEvent = events[next];
    if (throwEvent && throwEvent.kind === 'throw') {
      ctx.nextEdgeType = 'error';
      const description = describeThrow(throwEvent.exceptionType ?? 'Exception', noun);
      pushStep(
        ctx,
        description,
        `throw ${throwEvent.exceptionType ?? 'Exception'}`,
        sourceOf(ownerFile, throwEvent.line, method.name, ownerType.name),
      );
      next += 1;
      ctx.nextEdgeType = 'conditional';
    }
  } else if (ifEvent.guardReturns) {
    const returnEvent = events[next];
    if (returnEvent && returnEvent.kind === 'return') {
      ctx.nextEdgeType = 'error';
      handleReturn(returnEvent, ownerType, ownerFile, method, depth, noun, ctx);
      next += 1;
      ctx.nextEdgeType = 'conditional';
    }
  }

  return next;
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
    const event = events[index];
    if (!event) {
      break;
    }

    if (event.kind === 'if') {
      index = handleIf(events, index, ownerType, ownerFile, method, depth, noun, ctx);
      continue;
    }
    if (event.kind === 'call') {
      handleCall(event, ownerType, ownerFile, method, depth, noun, ctx);
      index += 1;
      continue;
    }
    if (event.kind === 'construct') {
      const description = describeConstruct(
        event.methodName ?? 'Object',
        Boolean(event.looksGenerated),
      );
      pushStep(
        ctx,
        description,
        `new ${event.methodName ?? 'Object'}(...)`,
        sourceOf(ownerFile, event.line, method.name, ownerType.name),
      );
      index += 1;
      continue;
    }
    if (event.kind === 'throw') {
      const description = describeThrow(event.exceptionType ?? 'Exception', noun);
      pushStep(
        ctx,
        description,
        `throw ${event.exceptionType ?? 'Exception'}`,
        sourceOf(ownerFile, event.line, method.name, ownerType.name),
      );
      index += 1;
      continue;
    }
    // Only 'return' remains among JavaBodyEventKind's variants at this point.
    handleReturn(event, ownerType, ownerFile, method, depth, noun, ctx);
    index += 1;
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
  const entryMethod = entryType?.methods.find((candidate) => candidate.name === api.methodName);

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
    visited: new Set([`${entryType.name}#${entryMethod.name}`]),
    nextEdgeType: 'sequence',
    stepCount: 0,
  };

  const noun = domainNounFromType(entryType.name);
  pushStep(
    ctx,
    describeApiEntry(api, noun),
    `${api.className}.${api.methodName}()`,
    sourceOf(api.file, api.line, api.methodName, api.className),
  );

  unroll(entryType, api.file, entryMethod, 0, ctx);

  return ok({ apiId: api.id, steps: ctx.steps });
}
