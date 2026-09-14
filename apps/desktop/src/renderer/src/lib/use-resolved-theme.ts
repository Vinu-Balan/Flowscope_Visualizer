import { useEffect, useState } from 'react';
import { useSettingsQuery } from './queries';
import { resolveTheme, type ResolvedTheme } from './theme';

/**
 * The current resolved theme ('light'/'dark'), reactive to both the
 * persisted preference and OS color-scheme changes — the same resolution
 * `useThemeSync` applies to the DOM, but as a value components can pass
 * to non-CSS rendering (Cytoscape's stylesheet isn't CSS, so it can't
 * just inherit `data-theme` — docs/sprints/SPRINT-6.md).
 */
export function useResolvedTheme(): ResolvedTheme {
  const settingsQuery = useSettingsQuery();
  const preference = settingsQuery.data?.theme ?? 'system';
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = (): void => {
      setPrefersDark(media.matches);
    };
    sync();
    media.addEventListener('change', sync);
    return () => {
      media.removeEventListener('change', sync);
    };
  }, []);

  return resolveTheme(preference, prefersDark);
}
