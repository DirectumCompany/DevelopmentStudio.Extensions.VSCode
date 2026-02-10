import eslint from '@eslint/js';
import * as tsParser from '@typescript-eslint/parser';
import { configs as tsEslintConfigs } from 'typescript-eslint';

import jsdoc from 'eslint-plugin-jsdoc';
import { flatConfigs as importPlugin } from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import type { Linter } from 'eslint';

export default [
  eslint.configs.recommended,
  ...tsEslintConfigs.recommendedTypeChecked,
  ...tsEslintConfigs.stylisticTypeChecked,
  jsdoc.configs['flat/recommended-typescript'],
  importPlugin.recommended,
  importPlugin.typescript,
  prettier,
  {},

  {
    files: ['**/*.ts'],
    ignores: ['./webpack.config.js'],

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',

      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },

    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },

    rules: {
      // Общие правила ESLint
      indent: ['error', 2, { SwitchCase: 1 }],
      quotes: ['error', 'single'],
      semi: ['error', 'always'],
      'linebreak-style': ['error', 'windows'],
      'object-curly-spacing': ['error', 'always'],
      eqeqeq: ['error', 'always'],
      'no-shadow': 'off',
      'consistent-return': 'error',

      // Правила для import
      'import/no-absolute-path': 'error',
      'import/no-mutable-exports': 'error',
      'import/first': 'error',
      'import/no-deprecated': 'error',

      'import/order': ['error'],
      'import/newline-after-import': 'error',
      'import/no-named-default': 'error',
      'import/no-useless-path-segments': 'error',

      // Правила для TypeScript
      '@typescript-eslint/array-type': ['error', { default: 'generic' }],
      '@typescript-eslint/explicit-function-return-type': ['error'],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-shadow': 'error',

      '@typescript-eslint/prefer-nullish-coalescing': ['warn'],

      // Правила для документирования
      'jsdoc/require-jsdoc': [
        'warn',
        { contexts: ['TSInterfaceDeclaration', 'TSMethodSignature', 'TSPropertySignature'] },
      ],
      'jsdoc/check-tag-names': [
        'warn',
        {
          definedTags: ['remarks'],
        },
      ],
    },
  },
] satisfies Array<Linter.Config>;
