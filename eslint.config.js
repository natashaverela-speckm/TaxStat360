import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// NOTE (Module 6): the previous config referenced reactHooks.configs.flat.recommended,
// which does not exist in eslint-plugin-react-hooks v5 — `npm run lint` crashed before
// linting a single file. v5 exposes the flat config as `recommended-latest`. Fixed below.
// Rule options are tuned to the codebase's established idioms so lint reports real issues
// rather than a wall of false positives (intentional fail-safe `catch {}` swallowing,
// underscore-prefixed throwaways, and Vitest globals in test files). CI gates on tests and
// build (.github/workflows), not lint, so these are developer-facing quality signals.

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Unused vars are surfaced as WARNINGS, not errors: this never-linted codebase has
      // ~30 pre-existing unused imports/locals to clear incrementally. They should be removed
      // file-by-file as those files are touched. no-undef (which just caught a real
      // ReferenceError) stays an ERROR via js.configs.recommended, so genuine bugs still fail.
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      // `catch {}` is an intentional swallow in several fail-safe paths.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Dev-server fast-refresh hint, not a correctness rule — inform without failing lint.
      'react-refresh/only-export-components': 'warn',
    },
  },
  // Test files run under Vitest globals (vitest.config.js sets globals: true).
  {
    files: ['**/*.{test,spec}.{js,jsx}', 'test-setup.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        vi: 'readonly', vitest: 'readonly',
        describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly',
        beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly',
      },
    },
  },
])
