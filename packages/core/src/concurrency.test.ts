import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './concurrency';

describe('mapWithConcurrency', () => {
  it('preserves input order regardless of completion order', async () => {
    const items = [30, 10, 20];
    const result = await mapWithConcurrency(items, 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(result).toEqual([30, 10, 20]);
  });

  it('never runs more than `limit` calls concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapWithConcurrency(items, 4, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return item * 2;
    });

    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it('produces the same result as a plain map', async () => {
    const items = [1, 2, 3, 4, 5];
    const result = await mapWithConcurrency(items, 2, (n) => Promise.resolve(n * n));
    expect(result).toEqual([1, 4, 9, 16, 25]);
  });

  it('handles an empty input array', async () => {
    const result = await mapWithConcurrency([], 4, (n: number) => Promise.resolve(n));
    expect(result).toEqual([]);
  });

  it('handles a limit larger than the item count', async () => {
    const result = await mapWithConcurrency([1, 2], 100, (n) => Promise.resolve(n));
    expect(result).toEqual([1, 2]);
  });

  it('handles a limit of 1 (fully serial)', async () => {
    const order: number[] = [];
    await mapWithConcurrency([1, 2, 3], 1, (n) => {
      order.push(n);
      return Promise.resolve(n);
    });
    expect(order).toEqual([1, 2, 3]);
  });
});
