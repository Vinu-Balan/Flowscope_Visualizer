import type { FlowScopeApi } from './index';

declare global {
  interface Window {
    // Optional, not guaranteed: if the preload script fails to load or
    // contextBridge.exposeInMainWorld throws, this stays undefined at
    // runtime even though the app expects it — see getFlowScopeApi().
    readonly flowscope?: FlowScopeApi;
  }
}
