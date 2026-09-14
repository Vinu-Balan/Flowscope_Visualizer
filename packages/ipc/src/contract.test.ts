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

  it('project.validate request requires a non-empty path', () => {
    const contract = IPC_CONTRACT[IPC_CHANNELS.projectValidate];
    expect(contract.request.safeParse({ path: '/tmp/project' }).success).toBe(true);
    expect(contract.request.safeParse({ path: '' }).success).toBe(false);
    expect(contract.request.safeParse({}).success).toBe(false);
  });

  it('project.validate response accepts both valid and invalid outcomes', () => {
    const contract = IPC_CONTRACT[IPC_CHANNELS.projectValidate];
    expect(
      contract.response.safeParse({
        status: 'valid',
        project: {
          id: '/tmp/demo',
          path: '/tmp/demo',
          name: 'demo',
          buildSystem: 'maven',
          buildFile: 'pom.xml',
          looksLikeSpringBoot: false,
        },
      }).success,
    ).toBe(true);
    expect(
      contract.response.safeParse({
        status: 'invalid',
        code: 'UNSUPPORTED_PROJECT',
        message: 'No build file found.',
      }).success,
    ).toBe(true);
    expect(contract.response.safeParse({ status: 'valid' }).success).toBe(false);
  });

  it('project.scan response accepts both success and error outcomes', () => {
    const contract = IPC_CONTRACT[IPC_CHANNELS.projectScan];
    expect(
      contract.response.safeParse({
        status: 'success',
        result: {
          projectPath: '/tmp/demo',
          scannedAt: new Date().toISOString(),
          durationMs: 12,
          totalFilesScanned: 3,
          totalDirectoriesSkipped: 0,
          javaFiles: [
            {
              path: 'src/main/java/A.java',
              sizeBytes: 10,
              contentHash: 'a'.repeat(64),
              sourceSet: 'main',
            },
          ],
          resourceFiles: [],
        },
      }).success,
    ).toBe(true);
    expect(contract.response.safeParse({ status: 'error', message: 'boom' }).success).toBe(true);
    expect(contract.response.safeParse({ status: 'error' }).success).toBe(false);
  });

  it('project.discoverApis request requires a path and a list of relative paths', () => {
    const contract = IPC_CONTRACT[IPC_CHANNELS.projectDiscoverApis];
    expect(
      contract.request.safeParse({ path: '/tmp/demo', javaFileRelativePaths: ['A.java'] }).success,
    ).toBe(true);
    expect(
      contract.request.safeParse({ path: '/tmp/demo', javaFileRelativePaths: [] }).success,
    ).toBe(true);
    expect(contract.request.safeParse({ path: '', javaFileRelativePaths: [] }).success).toBe(false);
    expect(contract.request.safeParse({ path: '/tmp/demo' }).success).toBe(false);
  });

  it('project.discoverApis response accepts both success and error outcomes', () => {
    const contract = IPC_CONTRACT[IPC_CHANNELS.projectDiscoverApis];
    expect(
      contract.response.safeParse({
        status: 'success',
        result: {
          apis: [
            {
              id: 'GET /customers#A.java:list',
              httpMethod: 'GET',
              path: '/customers',
              className: 'CustomerController',
              methodName: 'list',
              file: 'A.java',
              line: 10,
            },
          ],
          parsedFileCount: 1,
          failedFileCount: 0,
        },
      }).success,
    ).toBe(true);
    expect(contract.response.safeParse({ status: 'error', message: 'boom' }).success).toBe(true);
    expect(contract.response.safeParse({ status: 'error' }).success).toBe(false);
  });

  it('project.inferBusinessFlow request requires a path, relative paths, and a well-formed api', () => {
    const contract = IPC_CONTRACT[IPC_CHANNELS.projectInferBusinessFlow];
    const api = {
      id: 'POST /customers#A.java:register',
      httpMethod: 'POST',
      path: '/customers',
      className: 'CustomerController',
      methodName: 'register',
      file: 'A.java',
      line: 22,
    };
    expect(
      contract.request.safeParse({ path: '/tmp/demo', javaFileRelativePaths: ['A.java'], api })
        .success,
    ).toBe(true);
    expect(
      contract.request.safeParse({ path: '/tmp/demo', javaFileRelativePaths: [] }).success,
    ).toBe(false);
    expect(
      contract.request.safeParse({ path: '', javaFileRelativePaths: ['A.java'], api }).success,
    ).toBe(false);
  });

  it('project.inferBusinessFlow response accepts both success and error outcomes', () => {
    const contract = IPC_CONTRACT[IPC_CHANNELS.projectInferBusinessFlow];
    expect(
      contract.response.safeParse({
        status: 'success',
        result: {
          id: 'api1',
          apiId: 'api1',
          nodes: [
            {
              id: 'step-1',
              type: 'business-step',
              businessName: 'Register Customer',
              businessDescription: 'Registers a new customer.',
              confidence: 0.85,
              technicalName: 'CustomerController.register()',
            },
          ],
          edges: [],
        },
      }).success,
    ).toBe(true);
    expect(contract.response.safeParse({ status: 'error', message: 'boom' }).success).toBe(true);
    expect(contract.response.safeParse({ status: 'error' }).success).toBe(false);
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
