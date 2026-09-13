import type { ThemePreference } from '@flowscope/config';

export type ResolvedTheme = 'dark' | 'light';

/** Resolves a persisted theme preference against the OS's current color scheme. */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return preference;
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}
