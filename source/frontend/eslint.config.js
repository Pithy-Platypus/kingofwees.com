import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist', 'reports', '.stryker-tmp']),
  {
    // react-hooks' recommended set carries the React Compiler rules (refs, purity, set-state-in-effect …).
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked, reactHooks.configs.flat.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      // Type-aware rules (no-floating-promises, no-misused-promises …) read the tsconfig each file belongs to.
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Leaflet loads on demand: a direct import puts ~150 kB back into every visit, and nothing else fails.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)MapView$',
              allowTypeImports: true,
              message: 'Import MapView from LazyMapView, so Leaflet loads only when a map shows.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style']",
          message: 'Use semantic CSS classes, not inline styles.',
        },
        {
          selector: 'JSXText[value=/[A-Za-z]/]',
          message: 'User-visible text comes from the message catalog (react-intl), never literal JSX text.',
        },
        {
          selector:
            "JSXAttribute[name.name=/^(alt|title|placeholder|aria-label)$/] > Literal[value=/[A-Za-z]/]",
          message: 'User-visible attribute text comes from the message catalog (react-intl).',
        },
      ],
    },
  },
  {
    // Tests read mock calls and parsed bodies (`any` by nature) and fake async APIs with async arrows that await
    // nothing; the promise rules stay on (a forgotten await hides a failing assertion). Wallie, 2026-11-11.
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    // The wrapper itself, and tests of MapView, load it directly.
    files: ['src/king/LazyMapView.tsx', 'src/king/MapView.test.tsx', 'src/i18n/catalog.test.tsx'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },
);
