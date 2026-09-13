import { describe, expect, it } from 'vitest';
import {
  andThen,
  err,
  fromPromise,
  fromThrowable,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrap,
  unwrapOr,
} from './result';

describe('Result', () => {
  it('creates Ok and Err values', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('bad')).toEqual({ ok: false, error: 'bad' });
  });

  it('narrows with isOk / isErr', () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  it('map transforms only the success value', () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(map(err('bad'), (n: number) => n * 2)).toEqual(err('bad'));
  });

  it('mapErr transforms only the error value', () => {
    expect(mapErr(err('bad'), (e) => e.toUpperCase())).toEqual(err('BAD'));
    expect(mapErr(ok(2), (e: string) => e.toUpperCase())).toEqual(ok(2));
  });

  it('andThen chains Result-returning operations', () => {
    const parsePositive = (n: number) => (n > 0 ? ok(n) : err('not positive'));
    expect(andThen(ok(5), parsePositive)).toEqual(ok(5));
    expect(andThen(ok(-5), parsePositive)).toEqual(err('not positive'));
    expect(andThen(err('upstream'), parsePositive)).toEqual(err('upstream'));
  });

  it('unwrap returns the value or throws the error', () => {
    expect(unwrap(ok(7))).toBe(7);
    expect(() => unwrap(err(new Error('boom')))).toThrow('boom');
    expect(() => unwrap(err('boom'))).toThrow('boom');
  });

  it('unwrapOr falls back on Err', () => {
    expect(unwrapOr(ok(1), 0)).toBe(1);
    expect(unwrapOr(err('bad'), 0)).toBe(0);
  });

  it('fromThrowable captures thrown values as Err', () => {
    expect(fromThrowable(() => 1)).toEqual(ok(1));
    const thrown = fromThrowable(() => {
      throw new Error('boom');
    });
    expect(isErr(thrown)).toBe(true);
  });

  it('fromPromise captures rejected promises as Err', async () => {
    await expect(fromPromise(Promise.resolve(1))).resolves.toEqual(ok(1));
    const rejected = await fromPromise(Promise.reject(new Error('boom')));
    expect(isErr(rejected)).toBe(true);
  });
});
