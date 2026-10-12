import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist', 'reports', '.stryker-tmp']),
  {
    extends: [js.configs.recommended, tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
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
    // The wrapper itself, and tests of MapView, load it directly.
    files: ['src/king/LazyMapView.tsx', 'src/king/MapView.test.tsx', 'src/i18n/catalog.test.tsx'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },
);
