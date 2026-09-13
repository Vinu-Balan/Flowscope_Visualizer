import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  IpcError,
  ProjectNotFoundError,
  isFlowScopeError,
  toErrorMessage,
} from './errors';

describe('FlowScopeError hierarchy', () => {
  it('sets a fixed code per subclass', () => {
    expect(new ProjectNotFoundError({ message: 'nope' }).code).toBe('PROJECT_NOT_FOUND');
    expect(new ConfigurationError({ message: 'bad config' }).code).toBe('CONFIGURATION_ERROR');
  });

  it('sets name to the concrete subclass name', () => {
    expect(new IpcError({ message: 'x' }).name).toBe('IpcError');
  });

  it('preserves cause and context', () => {
    const cause = new Error('root cause');
    const error = new IpcError({ message: 'failed', cause, context: { channel: 'project.open' } });
    expect(error.cause).toBe(cause);
    expect(error.context).toEqual({ channel: 'project.open' });
  });

  it('serializes to a plain, IPC-safe object', () => {
    const error = new ProjectNotFoundError({ message: 'missing', context: { path: '/tmp/x' } });
    expect(error.toJSON()).toEqual({
      code: 'PROJECT_NOT_FOUND',
      name: 'ProjectNotFoundError',
      message: 'missing',
      context: { path: '/tmp/x' },
    });
  });

  it('isFlowScopeError distinguishes the hierarchy from plain errors', () => {
    expect(isFlowScopeError(new IpcError({ message: 'x' }))).toBe(true);
    expect(isFlowScopeError(new Error('plain'))).toBe(false);
    expect(isFlowScopeError('nope')).toBe(false);
  });
});

describe('toErrorMessage', () => {
  it('extracts the message from Error instances', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns strings unchanged', () => {
    expect(toErrorMessage('boom')).toBe('boom');
  });

  it('stringifies other values', () => {
    expect(toErrorMessage({ code: 42 })).toBe('{"code":42}');
  });
});
