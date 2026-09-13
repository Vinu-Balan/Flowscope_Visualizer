export { IPC_CHANNELS } from './channels';
export type { IpcChannelName } from './channels';
export { IPC_CONTRACT } from './contract';
export type { IpcContract, IpcChannel, IpcRequest, IpcResponse } from './contract';
export { parseOrThrow } from './validate';

export { SystemPingRequestSchema, SystemPingResponseSchema } from './contracts/system';
export type { SystemPingResponse } from './contracts/system';

export { ProjectOpenRequestSchema, ProjectOpenResponseSchema } from './contracts/project';
export type { ProjectOpenResponse } from './contracts/project';

export {
  SettingsGetRequestSchema,
  SettingsGetResponseSchema,
  SettingsUpdateRequestSchema,
  SettingsUpdateResponseSchema,
} from './contracts/settings';
