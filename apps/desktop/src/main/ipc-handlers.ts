import { inferBusinessFlow } from '@flowscope/business-analyzer';
import type { SettingsStore } from '@flowscope/config';
import { withRecentProject } from '@flowscope/config';
import { buildGraph } from '@flowscope/graph-engine';
import {
  IPC_CHANNELS,
  ProjectDiscoverApisRequestSchema,
  ProjectDiscoverApisResponseSchema,
  ProjectInferBusinessFlowRequestSchema,
  ProjectInferBusinessFlowResponseSchema,
  ProjectOpenResponseSchema,
  ProjectScanRequestSchema,
  ProjectScanResponseSchema,
  ProjectValidateRequestSchema,
  ProjectValidateResponseSchema,
  SettingsGetResponseSchema,
  SettingsUpdateRequestSchema,
  SettingsUpdateResponseSchema,
  SystemPingResponseSchema,
  parseOrThrow,
} from '@flowscope/ipc';
import type { Logger } from '@flowscope/logging';
import { parseJavaFiles } from '@flowscope/parser-java';
import { discoverApis } from '@flowscope/parser-spring';
import { scanProject } from '@flowscope/scanner';
import { validateProject } from '@flowscope/workspace';
import { app, dialog, ipcMain, type BrowserWindow } from 'electron';

export interface RegisterIpcHandlersOptions {
  readonly window: BrowserWindow;
  readonly settings: SettingsStore;
  readonly logger: Logger;
}

/**
 * Registers every IPC operation in packages/ipc's contract — and only
 * those; see docs/adr/ADR-004-ipc-boundary.md. Each handler validates its
 * own response against the contract schema before returning it, so a bug
 * that would produce an out-of-contract payload fails loudly in
 * development instead of silently reaching the renderer.
 */
export function registerIpcHandlers({
  window,
  settings,
  logger,
}: RegisterIpcHandlersOptions): void {
  const log = logger.child('ipc');

  ipcMain.handle(IPC_CHANNELS.systemPing, () => {
    const response = {
      pong: true as const,
      appVersion: app.getVersion(),
      platform: process.platform,
      timestamp: Date.now(),
    };
    return parseOrThrow(SystemPingResponseSchema, response, {
      channel: IPC_CHANNELS.systemPing,
      direction: 'response',
    });
  });

  ipcMain.handle(IPC_CHANNELS.projectOpen, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open Project',
      buttonLabel: 'Open',
      properties: ['openDirectory'],
    });

    const selectedPath = result.filePaths[0];
    if (result.canceled || selectedPath === undefined) {
      log.info('project.open canceled by user');
      return parseOrThrow(
        ProjectOpenResponseSchema,
        { canceled: true },
        { channel: IPC_CHANNELS.projectOpen, direction: 'response' },
      );
    }

    log.info('project.open selected a directory', { path: selectedPath });

    return parseOrThrow(
      ProjectOpenResponseSchema,
      { canceled: false, path: selectedPath },
      { channel: IPC_CHANNELS.projectOpen, direction: 'response' },
    );
  });

  ipcMain.handle(IPC_CHANNELS.projectValidate, async (_event, rawRequest: unknown) => {
    const request = parseOrThrow(ProjectValidateRequestSchema, rawRequest, {
      channel: IPC_CHANNELS.projectValidate,
      direction: 'request',
    });

    const result = await validateProject(request.path);

    if (!result.ok) {
      log.info('project.validate rejected a path', {
        path: request.path,
        code: result.error.code,
      });
      return parseOrThrow(
        ProjectValidateResponseSchema,
        { status: 'invalid', code: result.error.code, message: result.error.message },
        { channel: IPC_CHANNELS.projectValidate, direction: 'response' },
      );
    }

    log.info('project.validate accepted a project', {
      path: result.value.path,
      buildSystem: result.value.buildSystem,
      looksLikeSpringBoot: result.value.looksLikeSpringBoot,
    });

    // Only projects that actually validate make it into "recent" — an
    // invalid folder should never show up there (docs/sprints/SPRINT-2.md).
    const updateResult = await settings.update({
      recentProjects: withRecentProject(settings.current.recentProjects, result.value.path),
    });
    if (!updateResult.ok) {
      log.warn('failed to record recent project', { error: updateResult.error.toJSON() });
    }

    return parseOrThrow(
      ProjectValidateResponseSchema,
      { status: 'valid', project: result.value },
      { channel: IPC_CHANNELS.projectValidate, direction: 'response' },
    );
  });

  ipcMain.handle(IPC_CHANNELS.projectScan, async (_event, rawRequest: unknown) => {
    const request = parseOrThrow(ProjectScanRequestSchema, rawRequest, {
      channel: IPC_CHANNELS.projectScan,
      direction: 'request',
    });

    const result = await scanProject(request.path);

    if (!result.ok) {
      log.warn('project.scan failed', { path: request.path, error: result.error.toJSON() });
      return parseOrThrow(
        ProjectScanResponseSchema,
        { status: 'error', message: result.error.message },
        { channel: IPC_CHANNELS.projectScan, direction: 'response' },
      );
    }

    log.info('project.scan completed', {
      path: request.path,
      javaFiles: result.value.javaFiles.length,
      resourceFiles: result.value.resourceFiles.length,
      durationMs: result.value.durationMs,
    });

    return parseOrThrow(
      ProjectScanResponseSchema,
      { status: 'success', result: result.value },
      { channel: IPC_CHANNELS.projectScan, direction: 'response' },
    );
  });

  ipcMain.handle(IPC_CHANNELS.projectDiscoverApis, async (_event, rawRequest: unknown) => {
    const request = parseOrThrow(ProjectDiscoverApisRequestSchema, rawRequest, {
      channel: IPC_CHANNELS.projectDiscoverApis,
      direction: 'request',
    });

    const result = await discoverApis(request.path, request.javaFileRelativePaths);

    if (!result.ok) {
      log.warn('project.discoverApis failed', {
        path: request.path,
        error: result.error.toJSON(),
      });
      return parseOrThrow(
        ProjectDiscoverApisResponseSchema,
        { status: 'error', message: result.error.message },
        { channel: IPC_CHANNELS.projectDiscoverApis, direction: 'response' },
      );
    }

    log.info('project.discoverApis completed', {
      path: request.path,
      apis: result.value.apis.length,
      parsedFileCount: result.value.parsedFileCount,
      failedFileCount: result.value.failedFileCount,
    });

    return parseOrThrow(
      ProjectDiscoverApisResponseSchema,
      { status: 'success', result: result.value },
      { channel: IPC_CHANNELS.projectDiscoverApis, direction: 'response' },
    );
  });

  ipcMain.handle(IPC_CHANNELS.projectInferBusinessFlow, async (_event, rawRequest: unknown) => {
    const request = parseOrThrow(ProjectInferBusinessFlowRequestSchema, rawRequest, {
      channel: IPC_CHANNELS.projectInferBusinessFlow,
      direction: 'request',
    });

    const parsed = await parseJavaFiles(request.path, request.javaFileRelativePaths);
    if (!parsed.ok) {
      log.warn('project.inferBusinessFlow failed to parse project files', {
        path: request.path,
        error: parsed.error.toJSON(),
      });
      return parseOrThrow(
        ProjectInferBusinessFlowResponseSchema,
        { status: 'error', message: parsed.error.message },
        { channel: IPC_CHANNELS.projectInferBusinessFlow, direction: 'response' },
      );
    }

    const flow = inferBusinessFlow(request.api, parsed.value.files);
    if (!flow.ok) {
      log.warn('project.inferBusinessFlow could not locate the API entry point', {
        apiId: request.api.id,
        error: flow.error.toJSON(),
      });
      return parseOrThrow(
        ProjectInferBusinessFlowResponseSchema,
        { status: 'error', message: flow.error.message },
        { channel: IPC_CHANNELS.projectInferBusinessFlow, direction: 'response' },
      );
    }

    const graph = buildGraph(flow.value);
    if (!graph.ok) {
      log.error('project.inferBusinessFlow built an invalid graph', {
        apiId: request.api.id,
        error: graph.error.toJSON(),
      });
      return parseOrThrow(
        ProjectInferBusinessFlowResponseSchema,
        { status: 'error', message: graph.error.message },
        { channel: IPC_CHANNELS.projectInferBusinessFlow, direction: 'response' },
      );
    }

    log.info('project.inferBusinessFlow completed', {
      apiId: request.api.id,
      steps: flow.value.steps.length,
    });

    return parseOrThrow(
      ProjectInferBusinessFlowResponseSchema,
      { status: 'success', result: graph.value },
      { channel: IPC_CHANNELS.projectInferBusinessFlow, direction: 'response' },
    );
  });

  ipcMain.handle(IPC_CHANNELS.settingsGet, () =>
    parseOrThrow(SettingsGetResponseSchema, settings.current, {
      channel: IPC_CHANNELS.settingsGet,
      direction: 'response',
    }),
  );

  ipcMain.handle(IPC_CHANNELS.settingsUpdate, async (_event, rawPatch: unknown) => {
    const patch = parseOrThrow(SettingsUpdateRequestSchema, rawPatch, {
      channel: IPC_CHANNELS.settingsUpdate,
      direction: 'request',
    });

    const result = await settings.update(patch);
    if (!result.ok) {
      log.error('settings.update failed', { error: result.error.toJSON() });
      throw result.error;
    }

    return parseOrThrow(SettingsUpdateResponseSchema, result.value, {
      channel: IPC_CHANNELS.settingsUpdate,
      direction: 'response',
    });
  });
}
