import { describe, expect, it } from 'vitest';
import { redact } from './redact';

describe('redact', () => {
  it('redacts keys that look sensitive', () => {
    expect(redact({ password: 'hunter2', token: 'abc', apiKey: 'xyz' })).toEqual({
      password: '[REDACTED]',
      token: '[REDACTED]',
      apiKey: '[REDACTED]',
    });
  });

  it('leaves non-sensitive keys untouched', () => {
    expect(redact({ path: '/tmp/project', count: 42 })).toEqual({
      path: '/tmp/project',
      count: 42,
    });
  });

  it('redacts nested objects', () => {
    expect(redact({ request: { headers: { authorization: 'Bearer x' } } })).toEqual({
      request: { headers: { authorization: '[REDACTED]' } },
    });
  });

  it('redacts within arrays without touching array shape', () => {
    expect(redact({ items: [{ secret: 'a' }, { name: 'b' }] })).toEqual({
      items: [{ secret: '[REDACTED]' }, { name: 'b' }],
    });
  });

  it('passes primitives through unchanged', () => {
    expect(redact('hello')).toBe('hello');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
  });
});
