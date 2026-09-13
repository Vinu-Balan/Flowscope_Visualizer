import type { Settings, SettingsUpdate } from '@flowscope/config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getFlowScopeApi } from './ipc-client';

export const queryKeys = {
  ping: ['system', 'ping'] as const,
  settings: ['settings'] as const,
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
