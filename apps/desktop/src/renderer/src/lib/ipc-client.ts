/**
 * The single access point for the preload bridge — see
 * docs/adr/ADR-004-ipc-boundary.md. `window.flowscope` is typed globally by
 * src/preload/index.d.ts, included via tsconfig.web.json.
 */
export function getFlowScopeApi(): NonNullable<Window['flowscope']> {
  if (!window.flowscope) {
    throw new Error(
      'The flowscope preload bridge is not available. This usually means contextIsolation ' +
        'or the preload script failed to load — check the Electron main process logs.',
    );
  }
  return window.flowscope;
}
