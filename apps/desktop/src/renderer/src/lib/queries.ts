import type { Settings, SettingsUpdate } from '@flowscope/config';
import type { DiscoveredApi } from '@flowscope/parser-spring/api';
import type { ProjectScanResult } from '@flowscope/scanner/scan-result';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getFlowScopeApi } from './ipc-client';

export const queryKeys = {
  ping: ['system', 'ping'] as const,
  settings: ['settings'] as const,
  projectScan: (projectPath: string) => ['project-scan', projectPath] as const,
  projectDiscoverApis: (projectPath: string) => ['project-discover-apis', projectPath] as const,
  projectInferBusinessFlow: (projectPath: string, apiId: string) =>
    ['project-infer-business-flow', projectPath, apiId] as const,
};

/** Confirms the main process is up — surfaced in the status bar. */
export function usePingQuery() {
  return useQuery({
    queryKey: queryKeys.ping,
    queryFn: () => getFlowScopeApi().ping(),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => getFlowScopeApi().getSettings(),
    staleTime: Infinity,
  });
}

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsUpdate) => getFlowScopeApi().updateSettings(patch),
    onSuccess: (settings) => {
      queryClient.setQueryData<Settings>(queryKeys.settings, settings);
    },
  });
}

export function useOpenProjectMutation() {
  return useMutation({
    mutationFn: () => getFlowScopeApi().openProject(),
  });
}

/**
 * Validates a project folder (docs/sprints/SPRINT-2.md). A successful
 * validation updates the main process's recent-projects list, so this
 * invalidates the cached settings to pick that change up.
 */
export function useValidateProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => getFlowScopeApi().validateProject(path),
    onSuccess: (result) => {
      if (result.status === 'valid') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      }
    },
  });
}

/**
 * Scans a project's file tree (docs/sprints/SPRINT-3.md). A plain lazy
 * query rather than a mutation: `enabled: false` stops it auto-fetching,
 * but every component that calls this hook with the same `projectPath`
 * shares one cache entry, so the toolbar's Analyze button (which triggers
 * `refetch()`) and the sidebar (which just reads `data`/`isFetching`) stay
 * in sync without any bespoke shared state.
 */
export function useProjectScanQuery(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectScan(projectPath ?? ''),
    queryFn: async () => {
      const response = await getFlowScopeApi().scanProject(projectPath ?? '');
      if (response.status === 'error') {
        throw new Error(response.message);
      }
      return response.result;
    },
    enabled: false,
    retry: false,
  });
}

/**
 * Discovers Spring MVC APIs in the project's non-test Java files
 * (docs/sprints/SPRINT-4.md). A lazy query like `useProjectScanQuery` above,
 * sharing the same cache-key-per-project pattern. Its `queryFn` reads the
 * scan result straight out of the query cache rather than taking it as a
 * hook argument, so a `refetch()` always sees whatever scan most recently
 * completed instead of a stale closure from the render that called it.
 */
export function useDiscoverApisQuery(projectPath: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.projectDiscoverApis(projectPath ?? ''),
    queryFn: async () => {
      const scanResult = queryClient.getQueryData<ProjectScanResult>(
        queryKeys.projectScan(projectPath ?? ''),
      );
      const javaFileRelativePaths = (scanResult?.javaFiles ?? [])
        .filter((file) => file.sourceSet !== 'test')
        .map((file) => file.path);

      const response = await getFlowScopeApi().discoverApis(
        projectPath ?? '',
        javaFileRelativePaths,
      );
      if (response.status === 'error') {
        throw new Error(response.message);
      }
      return response.result;
    },
    enabled: false,
    retry: false,
  });
}

/**
 * Infers the business flow for one selected API (docs/sprints/SPRINT-5.md).
 * Unlike the scan/discovery queries above, there's no separate "Analyze"
 * button driving this one — selecting an API in the sidebar *is* the
 * trigger, so this auto-fetches via `enabled` whenever `api` changes
 * (TanStack Query re-runs a query automatically when its key changes),
 * rather than the manual `refetch()` pattern.
 */
export function useInferBusinessFlowQuery(
  projectPath: string | undefined,
  api: DiscoveredApi | undefined,
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.projectInferBusinessFlow(projectPath ?? '', api?.id ?? ''),
    queryFn: async () => {
      if (!api) {
        throw new Error('No API selected.');
      }
      const scanResult = queryClient.getQueryData<ProjectScanResult>(
        queryKeys.projectScan(projectPath ?? ''),
      );
      const javaFileRelativePaths = (scanResult?.javaFiles ?? [])
        .filter((file) => file.sourceSet !== 'test')
        .map((file) => file.path);

      const response = await getFlowScopeApi().inferBusinessFlow(
        projectPath ?? '',
        javaFileRelativePaths,
        api,
      );
      if (response.status === 'error') {
        throw new Error(response.message);
      }
      return response.result;
    },
    enabled: Boolean(projectPath) && Boolean(api),
    retry: false,
  });
}
