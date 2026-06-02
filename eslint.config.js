import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Flat ESLint config (TYPE-02). `npm run lint` now runs tsc AND eslint, so the
// committed `eslint-disable` directives are finally enforced by a real linter —
// notably react-hooks rules-of-hooks (error) and exhaustive-deps (warn).
//
// Deno Edge Functions (supabase/) use Deno globals + remote imports and are out
// of scope here; e2e/ and src/ are linted.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'supabase', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // exhaustive-deps stays a warning (doesn't fail CI) — it surfaces the
      // Quiz effect-deps gap (DATA-03/FE-04) without blocking unrelated work.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
