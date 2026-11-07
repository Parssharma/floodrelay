import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      '**/scripts/**',
      'package-lock.json',
      'benchmark-results/**',
    ],
  },
  {
    files: ['tests/load/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        __ENV: 'readonly',
        __VU: 'readonly',
        __ITER: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
);
