/**
 * `cytoscape-elk` ships no TypeScript types (and no `@types/cytoscape-elk`
 * package exists) — a minimal shim for the one thing we use it for:
 * registering the `'elk'` layout via `cytoscape.use(elk)`.
 */
declare module 'cytoscape-elk' {
  import type cytoscape from 'cytoscape';

  const register: (cy: typeof cytoscape) => void;
  export default register;
}
