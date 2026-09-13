import { useEffect } from 'react';
import { useSettingsQuery } from './queries';
import { applyResolvedTheme, resolveTheme } from './theme';

/** Keeps the DOM's `data-theme` in sync with the persisted preference and the OS color scheme. */
export function useThemeSync(): void {
  const settingsQuery = useSettingsQuery();
  const preference = settingsQuery.data?.theme ?? 'system';

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function sync(): void {
      applyResolvedTheme(resolveTheme(preference, media.matches));
    }

    sync();
    media.addEventListener('change', sync);
    return () => {
      media.removeEventListener('change', sync);
    };
  }, [preference]);
}
