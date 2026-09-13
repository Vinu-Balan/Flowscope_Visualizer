/**
 * Centralized error categories for FlowScope (see docs/CODING_GUIDELINES.md).
 * Every category is a concrete FlowScopeError subclass with a fixed `code`,
 * so callers can branch on `error.code` without string comparisons and
 * serialize errors safely across the IPC boundary via `toJSON()`.
 */

export type ErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'UNSUPPORTED_PROJECT'
  | 'INVALID_PROJECT'
  | 'PARSER_ERROR'
  | 'ANALYSIS_ERROR'
  | 'GRAPH_BUILD_ERROR'
  | 'SERIALIZATION_ERROR'
  | 'IPC_ERROR'
  | 'CONFIGURATION_ERROR';

export interface SerializedFlowScopeError {
  readonly code: ErrorCode;
  readonly name: string;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>> | undefined;
}

export interface FlowScopeErrorOptions {
  readonly message: string;
  readonly cause?: unknown;
  readonly context?: Readonly<Record<string, unknown>> | undefined;
}

export abstract class FlowScopeError extends Error {
  abstract readonly code: ErrorCode;
  readonly context?: Readonly<Record<string, unknown>> | undefined;

  constructor(options: FlowScopeErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.context = options.context;
    this.name = new.target.name;
  }

  /** A plain-object form safe to send across the IPC boundary or into logs. */
  toJSON(): SerializedFlowScopeError {
    return {
      code: this.code,
      name: this.name,
      message: this.message,
      context: this.context,
    };
  }
}

export class ProjectNotFoundError extends FlowScopeError {
  readonly code = 'PROJECT_NOT_FOUND' as const;
}

export class UnsupportedProjectError extends FlowScopeError {
  readonly code = 'UNSUPPORTED_PROJECT' as const;
}

export class InvalidProjectError extends FlowScopeError {
  readonly code = 'INVALID_PROJECT' as const;
}

export class ParserError extends FlowScopeError {
  readonly code = 'PARSER_ERROR' as const;
}

export class AnalysisError extends FlowScopeError {
  readonly code = 'ANALYSIS_ERROR' as const;
}

export class GraphBuildError extends FlowScopeError {
  readonly code = 'GRAPH_BUILD_ERROR' as const;
}

export class SerializationError extends FlowScopeError {
  readonly code = 'SERIALIZATION_ERROR' as const;
}

export class IpcError extends FlowScopeError {
  readonly code = 'IPC_ERROR' as const;
}

export class ConfigurationError extends FlowScopeError {
  readonly code = 'CONFIGURATION_ERROR' as const;
}

/** True for any error produced by the FlowScope error hierarchy. */
export function isFlowScopeError(value: unknown): value is FlowScopeError {
  return value instanceof FlowScopeError;
}

/** Best-effort conversion of an unknown thrown value into a readable message. */
export function toErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
