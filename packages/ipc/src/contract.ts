import type { z } from 'zod';
import { IPC_CHANNELS } from './channels';
import {
  ProjectOpenRequestSchema,
  ProjectOpenResponseSchema,
  ProjectValidateRequestSchema,
  ProjectValidateResponseSchema,
} from './contracts/project';
import {
  SettingsGetRequestSchema,
  SettingsGetResponseSchema,
  SettingsUpdateRequestSchema,
  SettingsUpdateResponseSchema,
} from './contracts/settings';
import { SystemPingRequestSchema, SystemPingResponseSchema } from './contracts/system';

/**
 * The full IPC contract: every channel paired with its request and response
 * schema. This single map is the source of truth both the main-process
 * handler registry and the renderer's typed bridge are checked against —
 * adding a channel here is the only place a new operation is declared.
 */
export const IPC_CONTRACT = {
  [IPC_CHANNELS.systemPing]: {
    request: SystemPingRequestSchema,
    response: SystemPingResponseSchema,
  },
  [IPC_CHANNELS.projectOpen]: {
    request: ProjectOpenRequestSchema,
    response: ProjectOpenResponseSchema,
  },
  [IPC_CHANNELS.projectValidate]: {
    request: ProjectValidateRequestSchema,
    response: ProjectValidateResponseSchema,
  },
  [IPC_CHANNELS.settingsGet]: {
    request: SettingsGetRequestSchema,
    response: SettingsGetResponseSchema,
  },
  [IPC_CHANNELS.settingsUpdate]: {
    request: SettingsUpdateRequestSchema,
    response: SettingsUpdateResponseSchema,
  },
} as const;

export type IpcContract = typeof IPC_CONTRACT;
export type IpcChannel = keyof IpcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>;
