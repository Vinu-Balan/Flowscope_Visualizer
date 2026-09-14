import { toast } from '@flowscope/ui';
import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useAppStore } from '../store/app-store';
import { useDiscoverApisQuery, useProjectScanQuery } from './queries';

function pluralize(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * The single "Analyze" flow shared by the toolbar's Analyze button and the
 * Ctrl/Cmd+Shift+A shortcut (MASTER_PLAN.md §67, docs/sprints/SPRINT-3.md):
 * scan the current project's file tree, then discover its Spring APIs
 * (docs/sprints/SPRINT-4.md). Reading the results (counts, loading/error
 * state) happens separately in the Architecture sidebar via the same
 * `useProjectScanQuery`/`useDiscoverApisQuery` cache entries.
 */
export function useAnalyzeProjectFlow() {
  const navigate = useNavigate();
  const currentProject = useAppStore((state) => state.currentProject);
  const scanQuery = useProjectScanQuery(currentProject?.path);
  const discoverApisQuery = useDiscoverApisQuery(currentProject?.path);

  const analyze = useCallback(async () => {
    if (!currentProject) {
      return;
    }

    await navigate({ to: '/workspace' });
    const { data: scanData, error: scanError } = await scanQuery.refetch();

    if (scanError) {
      toast({ title: 'Scan failed', description: scanError.message, variant: 'error' });
      return;
    }
    if (!scanData) {
      return;
    }

    const { data: apiData, error: apiError } = await discoverApisQuery.refetch();

    if (apiError) {
      toast({
        title: 'Scan complete, API discovery failed',
        description: apiError.message,
        variant: 'error',
      });
      return;
    }

    toast({
      title: 'Analysis complete',
      description: `${pluralize(scanData.javaFiles.length, 'Java file')} scanned, ${pluralize(apiData?.apis.length ?? 0, 'API')} discovered in ${currentProject.name}.`,
      variant: 'success',
    });
  }, [currentProject, navigate, scanQuery, discoverApisQuery]);

  return {
    analyze,
    isAnalyzing: scanQuery.isFetching || discoverApisQuery.isFetching,
    canAnalyze: currentProject !== null,
  };
}
