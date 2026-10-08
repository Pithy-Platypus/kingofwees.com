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
);
