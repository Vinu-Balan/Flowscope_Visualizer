export {
  THEME_PREFERENCES,
  ThemePreferenceSchema,
  LOG_LEVELS,
  LogLevelSchema,
  MAX_RECENT_PROJECTS,
  SettingsSchema,
  DEFAULT_SETTINGS,
  SettingsUpdateSchema,
  withRecentProject,
} from './settings';
export type { ThemePreference, SettingsLogLevel, Settings, SettingsUpdate } from './settings';
export { SettingsStore } from './settings-store';
