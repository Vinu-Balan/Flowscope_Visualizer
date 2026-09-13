import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import tailwindcss from 'tailwindcss';

/**
 * FlowScope's internal @flowscope/* packages ship TypeScript source only
 * (docs/ARCHITECTURE.md — no separate build step for internal packages).
 * They're aliased straight to `src` and excluded from externalization so
 * Vite/Rollup bundles them into main/preload/renderer output instead of
 * trying to `require()` a .ts file at runtime.
 */
const WORKSPACE_PACKAGES = ['core', 'logging', 'config', 'ipc', 'ui'] as const;

function workspaceAliases(): Record<string, string> {
  return Object.fromEntries(
    WORKSPACE_PACKAGES.map((name) => [
      `@flowscope/${name}`,
      resolve(__dirname, `../../packages/${name}/src`),
    ]),
  );
}

const workspacePackageNames = WORKSPACE_PACKAGES.map((name) => `@flowscope/${name}`);

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackageNames })],
    resolve: { alias: workspaceAliases() },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackageNames })],
    resolve: { alias: workspaceAliases() },
  },
  renderer: {
    resolve: {
      alias: {
        ...workspaceAliases(),
        '@renderer': resolve(__dirname, 'src/renderer/src'),
      },
    },
    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()],
      },
    },
    plugins: [react()],
  },
});
