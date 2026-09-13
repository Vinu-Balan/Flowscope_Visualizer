import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@flowscope/config';
import { IPC_CHANNELS } from './channels';
import { IPC_CONTRACT } from './contract';

describe('IPC_CONTRACT', () => {
  it('has exactly one entry per declared channel', () => {
    expect(Object.keys(IPC_CONTRACT).sort()).toEqual(Object.values(IPC_CHANNELS).sort());
  });

  it('system.ping accepts undefined requests and validates a well-formed response', () => {
    const contract = IPC_CONTRACT[IPC_CHANNELS.systemPing];
    expect(contract.request.safeParse(undefined).success).toBe(true);
    expect(
      contract.response.safeParse({
        pong: true,
        appVersion: '0.0.0',
        platform: 'win32',
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
    expect(contract.response.safeParse({ pong: false }).success).toBe(false);
  });

  it('project.open response requires a path when not canceled', () => {
    const contract = IPC_CONTRACT[IPC_CHANNELS.projectOpen];
    expect(contract.response.safeParse({ canceled: true }).success).toBe(true);
    expect(contract.response.safeParse({ canceled: false, path: '/tmp/project' }).success).toBe(
      true,
    );
    expect(contract.response.safeParse({ canceled: false }).success).toBe(false);
  });

  it('settings.get response is the full Settings shape', () => {
    const contract = IPC_CONTRACT[IPC_CHANNELS.settingsGet];
    expect(contract.response.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });

  it('settings.update accepts a partial patch as its request', () => {
    const contract = IPC_CONTRACT[IPC_CHANNELS.settingsUpdate];
    expect(contract.request.safeParse({ theme: 'dark' }).success).toBe(true);
    expect(contract.request.safeParse({}).success).toBe(true);
    expect(contract.request.safeParse({ theme: 'not-a-theme' }).success).toBe(false);
  });
});
