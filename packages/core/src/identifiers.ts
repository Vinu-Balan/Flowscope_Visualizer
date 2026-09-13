/** Generates a random, globally-unique identifier, optionally namespaced with a prefix. */
export function createId(prefix?: string): string {
  const id = globalThis.crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}
