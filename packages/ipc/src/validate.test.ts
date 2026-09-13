import { IpcError } from '@flowscope/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseOrThrow } from './validate';

describe('parseOrThrow', () => {
  const schema = z.object({ path: z.string().min(1) });

  it('returns the parsed value when valid', () => {
    expect(parseOrThrow(schema, { path: '/a' }, { channel: 'x', direction: 'request' })).toEqual({
      path: '/a',
    });
  });

  it('throws an IpcError describing the channel and direction when invalid', () => {
    expect(() =>
      parseOrThrow(schema, { path: '' }, { channel: 'project.open', direction: 'response' }),
    ).toThrow(IpcError);

    try {
      parseOrThrow(schema, {}, { channel: 'project.open', direction: 'request' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(IpcError);
      expect((error as IpcError).message).toContain('project.open');
      expect((error as IpcError).message).toContain('request');
    }
  });
});
