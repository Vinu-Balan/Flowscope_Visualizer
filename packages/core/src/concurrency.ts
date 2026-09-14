/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once,
 * preserving input order in the result array. Used anywhere FlowScope
 * needs to do bounded-concurrency I/O (content hashing in
 * packages/scanner, file parsing in packages/parser-spring) instead of
 * either serializing everything or firing unbounded `Promise.all` across
 * thousands of files (MASTER_PLAN.md §34 — design for 10,000+ files).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      const item = items[currentIndex];
      if (item !== undefined) {
        results[currentIndex] = await fn(item);
      }
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
