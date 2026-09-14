import { toast } from '@flowscope/ui';
import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useAppStore } from '../store/app-store';
import { useProjectScanQuery } from './queries';

function pluralize(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * The single "Analyze" flow shared by the toolbar's Analyze button and the
 * Ctrl/Cmd+Shift+A shortcut (MASTER_PLAN.md §67, docs/sprints/SPRINT-3.md):
 * scan the current project's file tree and report what was found. Reading
 * the result (counts, loading/error state) happens separately in the
 * Architecture sidebar via the same `useProjectScanQuery` cache entry.
 */
export function useAnalyzeProjectFlow() {
  const navigate = useNavigate();
  const currentProject = useAppStore((state) => state.currentProject);
  const scanQuery = useProjectScanQuery(currentProject?.path);

  const analyze = useCallback(async () => {
    if (!currentProject) {
      return;
    }

    await navigate({ to: '/workspace' });
    const { data, error } = await scanQuery.refetch();

    if (data) {
      toast({
        title: 'Scan complete',
        description: `${pluralize(data.javaFiles.length, 'Java file')} and ${pluralize(data.resourceFiles.length, 'resource file')} found in ${currentProject.name}.`,
        variant: 'success',
      });
    } else if (error) {
      toast({ title: 'Scan failed', description: error.message, variant: 'error' });
    }
  }, [currentProject, navigate, scanQuery]);

  return {
    analyze,
    isAnalyzing: scanQuery.isFetching,
    canAnalyze: currentProject !== null,
  };
}
