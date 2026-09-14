import type { Settings, SettingsUpdate } from '@flowscope/config';
import {
  IPC_CHANNELS,
  ProjectOpenResponseSchema,
  ProjectValidateRequestSchema,
  ProjectValidateResponseSchema,
  SettingsGetResponseSchema,
  SettingsUpdateRequestSchema,
  SettingsUpdateResponseSchema,
  SystemPingResponseSchema,
  parseOrThrow,
  type ProjectOpenResponse,
  type SystemPingResponse,
} from '@flowscope/ipc';
import type { ProjectValidationResult } from '@flowscope/workspace/project';
import { contextBridge, ipcRenderer } from 'electron';

/**
 * The entire renderer-visible capability surface of FlowScope — every
 * method here is one named, validated IPC round trip against the contract
 * in packages/ipc. There is no generic invoke(channel, payload) escape
 * hatch (docs/adr/ADR-004-ipc-boundary.md). Responses are validated again
 * here (not just in main) so a compromised or buggy main process can't
 * hand the renderer an out-of-contract payload unnoticed.
 */
const flowscopeApi = {
  async ping(): Promise<SystemPingResponse> {
    const raw: unknown = await ipcRenderer.invoke(IPC_CHANNELS.systemPing);
    return parseOrThrow(SystemPingResponseSchema, raw, {
      channel: IPC_CHANNELS.systemPing,
      direction: 'response',
    });
  },

  async openProject(): Promise<ProjectOpenResponse> {
    const raw: unknown = await ipcRenderer.invoke(IPC_CHANNELS.projectOpen);
    return parseOrThrow(ProjectOpenResponseSchema, raw, {
      channel: IPC_CHANNELS.projectOpen,
      direction: 'response',
    });
  },

  async validateProject(path: string): Promise<ProjectValidationResult> {
    const request = parseOrThrow(
      ProjectValidateRequestSchema,
      { path },
      { channel: IPC_CHANNELS.projectValidate, direction: 'request' },
    );
    const raw: unknown = await ipcRenderer.invoke(IPC_CHANNELS.projectValidate, request);
    return parseOrThrow(ProjectValidateResponseSchema, raw, {
      channel: IPC_CHANNELS.projectValidate,
      direction: 'response',
    });
  },

  async getSettings(): Promise<Settings> {
    const raw: unknown = await ipcRenderer.invoke(IPC_CHANNELS.settingsGet);
    return parseOrThrow(SettingsGetResponseSchema, raw, {
      channel: IPC_CHANNELS.settingsGet,
      direction: 'response',
    });
  },

  async updateSettings(patch: SettingsUpdate): Promise<Settings> {
    const validatedPatch = parseOrThrow(SettingsUpdateRequestSchema, patch, {
      channel: IPC_CHANNELS.settingsUpdate,
      direction: 'request',
    });
    const raw: unknown = await ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, validatedPatch);
    return parseOrThrow(SettingsUpdateResponseSchema, raw, {
      channel: IPC_CHANNELS.settingsUpdate,
      direction: 'response',
    });
  },
} as const;

export type FlowScopeApi = typeof flowscopeApi;

contextBridge.exposeInMainWorld('flowscope', flowscopeApi);
