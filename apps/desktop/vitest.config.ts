import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@flowscope/config': resolve(__dirname, '../../packages/config/src'),
      '@flowscope/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/renderer/src/**/*.test.{ts,tsx}'],
  },
});
