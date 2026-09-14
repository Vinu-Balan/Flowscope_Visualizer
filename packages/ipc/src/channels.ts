/**
 * The closed set of named IPC operations FlowScope exposes across the
 * Electron main/renderer boundary — see docs/adr/ADR-004-ipc-boundary.md.
 * Add new operations here deliberately, alongside a request/response schema
 * pair in `src/contracts/`; never introduce a generic passthrough channel.
 */
export const IPC_CHANNELS = {
  systemPing: 'system.ping',
  projectOpen: 'project.open',
  projectValidate: 'project.validate',
  projectScan: 'project.scan',
  projectDiscoverApis: 'project.discoverApis',
  settingsGet: 'settings.get',
  settingsUpdate: 'settings.update',
} as const;

export type IpcChannelName = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
