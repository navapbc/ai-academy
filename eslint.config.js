import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

// jsx-a11y (P6.4 / R1): its flat `recommended` set escalated to `error` — a hard
// a11y regression floor. `npm run lint` fails on any accessibility violation.
// Rules recommended leaves `off` (deprecated `label-has-for`, opt-in
// `anchor-ambiguous-text`, `control-has-associated-label`) stay off; enabled
// rules are bumped to `error` while preserving each rule's own options tuple.
const jsxA11yErrors = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules).flatMap(([rule, config]) => {
    const [severity, ...options] = Array.isArray(config) ? config : [config];
    if (severity === 'off' || severity === 0) return [];
    return [[rule, ['error', ...options]]];
  }),
);

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
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    languageOptions: {
      ...jsxA11y.flatConfigs.recommended.languageOptions,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // exhaustive-deps stays a warning (doesn't fail CI) — it surfaces the
      // Quiz effect-deps gap (DATA-03/FE-04) without blocking unrelated work.
      'react-hooks/exhaustive-deps': 'warn',
      // jsx-a11y recommended, all escalated to error (P6.4 R1).
      ...jsxA11yErrors,
    },
  },
  {
    // False-positive scope for `aria-role` (P6.4): `RoleGuard`/`StaffArea` are
    // domain components whose `role` prop means the *user* role (admin/champion/
    // learner), not an ARIA role — jsx-a11y can't tell a custom component's prop
    // from an HTML `role` attribute, so it flags valid domain props. These two
    // test files only pass `role` as that domain prop (no real DOM `role`), so
    // disabling the rule here loses no real coverage.
    files: ['src/components/RoleGuard.test.tsx', 'src/components/StaffArea.test.tsx'],
    rules: { 'jsx-a11y/aria-role': 'off' },
  },
);
