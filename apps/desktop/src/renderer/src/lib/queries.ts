import type { Settings, SettingsUpdate } from '@flowscope/config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getFlowScopeApi } from './ipc-client';

export const queryKeys = {
  ping: ['system', 'ping'] as const,
  settings: ['settings'] as const,
  projectScan: (projectPath: string) => ['project-scan', projectPath] as const,
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
