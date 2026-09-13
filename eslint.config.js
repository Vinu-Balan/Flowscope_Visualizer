import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-electron/**',
      '**/build/**',
      '**/out/**',
      '**/release/**',
      '**/target/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.config.*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-invalid-void-type': ['error', { allowAsThisParameter: true }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  prettier,
);
