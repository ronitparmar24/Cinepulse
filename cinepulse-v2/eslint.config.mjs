// ESLint flat config. `npm run lint` runs this; `npm run typecheck` runs tsc.
// Focus: async correctness (the data layer is async), React hooks, and Next.js rules.
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'scratch/**', 'test-results/**', 'claude-backups/**', 'next-env.d.ts', '**/*.mjs', '**/*.cjs', 'scripts/**/*.js'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin, '@next/next': nextPlugin, 'react-hooks': reactHooks },
    rules: {
      // A forgotten `await` on a database write silently loses data or races the response.
      '@typescript-eslint/no-floating-promises': ['error', {
        ignoreVoid: true,
        ignoreIIFE: true,
        // node:test runs and awaits these itself.
        allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['test', 'it', 'describe', 'before', 'after', 'beforeEach', 'afterEach'] }],
      }],
      // e.g. `.filter(async x => …)` is always truthy; `if (promise)` is always true.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/await-thenable': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      ...nextPlugin.configs.recommended.rules,
      '@next/next/no-img-element': 'off', // tracked separately: posters move to next/image in Phase 2
    },
  },
);
