import { toast } from '@flowscope/ui';
import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useAppStore } from '../store/app-store';
import {
  useOpenProjectMutation,
  useSettingsQuery,
  useUpdateSettingsMutation,
  useValidateProjectMutation,
} from './queries';

const BUILD_SYSTEM_LABEL = { maven: 'Maven', gradle: 'Gradle' } as const;

/**
 * The single "open a project" flow shared by the toolbar, the Welcome
 * screen, the command palette, and the Ctrl/Cmd+O shortcut
 * (docs/sprints/SPRINT-2.md) — open a folder (or reopen a recent one),
 * validate it, and either enter the workspace or explain exactly why not.
 */
export function useOpenProjectFlow() {
  const navigate = useNavigate();
  const setCurrentProject = useAppStore((state) => state.setCurrentProject);
  const openProjectMutation = useOpenProjectMutation();
  const validateProjectMutation = useValidateProjectMutation();
  const settingsQuery = useSettingsQuery();
  const updateSettingsMutation = useUpdateSettingsMutation();

  const forgetRecentProject = useCallback(
    (path: string) => {
      const recentProjects = settingsQuery.data?.recentProjects ?? [];
      if (recentProjects.includes(path)) {
        updateSettingsMutation.mutate({
          recentProjects: recentProjects.filter((existing) => existing !== path),
        });
      }
    },
    [settingsQuery.data?.recentProjects, updateSettingsMutation],
  );

  const validateAndEnter = useCallback(
    async (path: string) => {
      const result = await validateProjectMutation.mutateAsync(path).catch(() => null);

      if (!result) {
        toast({
          title: 'Could not open project',
          description: 'Check the application logs for details.',
          variant: 'error',
        });
        return;
      }

      if (result.status === 'invalid') {
        toast({ title: 'Could not open project', description: result.message, variant: 'error' });
        if (result.code === 'PROJECT_NOT_FOUND') {
          forgetRecentProject(path);
        }
        return;
      }

      if (!result.project.looksLikeSpringBoot) {
        toast({
          title: "This doesn't look like a Spring Boot project",
          description: `FlowScope found a ${BUILD_SYSTEM_LABEL[result.project.buildSystem]} project, but nothing mentioning Spring Boot in its build file. Opening it anyway — analysis may not find much.`,
          variant: 'info',
          duration: 8000,
        });
      }

      setCurrentProject(result.project);
      await navigate({ to: '/workspace' });
    },
    [forgetRecentProject, navigate, setCurrentProject, validateProjectMutation],
  );

  const openViaDialog = useCallback(async () => {
    const openResult = await openProjectMutation.mutateAsync().catch(() => null);
    if (!openResult) {
      toast({ title: 'Could not open project', variant: 'error' });
      return;
    }
    if (openResult.canceled) {
      return;
    }
    await validateAndEnter(openResult.path);
  }, [openProjectMutation, validateAndEnter]);

  return {
    openViaDialog,
    validateAndEnter,
    isPending: openProjectMutation.isPending || validateProjectMutation.isPending,
  };
}
