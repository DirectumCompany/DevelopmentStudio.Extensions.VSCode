import eslint from '@eslint/js';
import * as tsParser from '@typescript-eslint/parser';
import { configs as tsEslintConfigs } from 'typescript-eslint';

import jsdoc from 'eslint-plugin-jsdoc';
import { flatConfigs as importPlugin } from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';
import type { Linter } from 'eslint';

/** Файлы, к которым применимы правила с информацией о типах. */
const typeScriptFiles = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];

/**
 * Ограничить конфиги указанными файлами.
 * @description Конфигурации typescript-eslint с информацией о типах не задают `files`, поэтому без ограничения
 * они применяются и к JS (вебвью-скрипты) и падают на разборе без сервисов парсера.
 * @param configs Конфигурации.
 * @param files Шаблоны файлов.
 * @returns Конфигурации с заданным `files`.
 */
const forFiles = (configs: Array<Linter.Config>, files: Array<string>): Array<Linter.Config> =>
  configs.map((config) => ({ ...config, files }));

export default [
  eslint.configs.recommended,
  ...forFiles(tsEslintConfigs.recommendedTypeChecked, typeScriptFiles),
  ...forFiles(tsEslintConfigs.stylisticTypeChecked, typeScriptFiles),
  { ...jsdoc.configs['flat/recommended-typescript'], files: typeScriptFiles },
  { ...importPlugin.recommended, files: typeScriptFiles },
  { ...importPlugin.typescript, files: typeScriptFiles },
  prettier,
  {},

  {
    files: typeScriptFiles,
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
      'import-x/resolver': {
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
      'import-x/no-absolute-path': 'error',
      'import-x/no-mutable-exports': 'error',
      'import-x/first': 'error',
      'import-x/no-deprecated': 'error',

      'import-x/order': ['error'],
      'import-x/newline-after-import': 'error',
      'import-x/no-named-default': 'error',
      'import-x/no-useless-path-segments': 'error',

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
  {
    files: ['src/commands/media/**/*.js'],

    languageOptions: {
      // Вебвью-скрипт исполняется в окне webview: доступны DOM и API VS Code.
      globals: {
        document: 'readonly',
        window: 'readonly',
        acquireVsCodeApi: 'readonly',
      },
    },
  },
] satisfies Array<Linter.Config>;
