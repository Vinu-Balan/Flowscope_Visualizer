// Imported from the isomorphic `/settings` subpath, not the package root —
// the root barrel also exports the Node-only SettingsStore (node:fs), which
// must never end up in the preload/renderer bundle. See the comment atop
// packages/config/src/settings.ts.
import { SettingsSchema, SettingsUpdateSchema } from '@flowscope/config/settings';
import { z } from 'zod';

export const SettingsGetRequestSchema = z.undefined();
export const SettingsGetResponseSchema = SettingsSchema;

export const SettingsUpdateRequestSchema = SettingsUpdateSchema;
export const SettingsUpdateResponseSchema = SettingsSchema;
