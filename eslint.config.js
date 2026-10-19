// Lint gate for every package and tool. Zero warnings: `pnpm lint` runs with --max-warnings 0.
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import esX from 'eslint-plugin-es-x';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

const FUNCTION_LENGTH_LIMIT = 30;
const FILE_LENGTH_LIMIT = 300;
const COMPLEXITY_LIMIT = 8;
const NESTING_LIMIT = 3;
const PARAMETER_LIMIT = 3;

/** Class layout: fields, constructor, static factories, accessors, then instance methods by visibility. */
const MEMBER_ORDER = [
  'signature',
  'public-static-field',
  'protected-static-field',
  'private-static-field',
  'public-instance-field',
  'protected-instance-field',
  'private-instance-field',
  'constructor',
  'public-static-method',
  'protected-static-method',
  'private-static-method',
  ['public-get', 'public-set'],
  'public-instance-method',
  'protected-instance-method',
  'private-instance-method',
];

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    '**/reports/',
    '**/.stryker-tmp/',
  ]),
  {
    files: ['packages/**/*.ts', 'tools/**/*.ts', '*.ts'],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      unicorn.configs.recommended,
      prettier,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      complexity: ['error', COMPLEXITY_LIMIT],
      'max-depth': ['error', NESTING_LIMIT],
      'max-lines': ['error', { max: FILE_LENGTH_LIMIT, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: FUNCTION_LENGTH_LIMIT, skipBlankLines: true, skipComments: true },
      ],
      'max-params': ['error', PARAMETER_LIMIT],
      'no-console': 'error',
      'no-param-reassign': 'error',
      'no-bitwise': 'off',
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2],
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
          ignoreNumericLiteralTypes: true,
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unsafe-unary-minus': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: false, allowNullish: false },
      ],
      '@typescript-eslint/member-ordering': ['error', { default: MEMBER_ORDER }],
      'unicorn/consistent-class-member-order': 'off',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'forbid' },
        {
          selector: 'variable',
          modifiers: ['const', 'global'],
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        {
          selector: ['objectLiteralProperty', 'typeProperty'],
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty'],
          modifiers: ['requiresQuotes'],
          format: null,
        },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase'] },
        { selector: 'import', format: null },
      ],
      'unicorn/filename-case': [
        'error',
        {
          cases: { camelCase: true, pascalCase: true },
          directoryRoots: [/^(packages\/adapters|packages|tools)\/[^/]+$/u],
        },
      ],
      'unicorn/no-null': 'off',
      // One-line TSDoc summaries (`/** ... */`) are the house style.
      'unicorn/single-line-block-comment-style': 'off',
      'unicorn/prefer-iterator-to-array': 'off',
      'unicorn/name-replacements': [
        'error',
        {
          allowList: { fx: true, fy: true, cx: true, cy: true, xi: true },
          replacements: { configuration: false },
        },
      ],
    },
  },
  {
    // What a page runs: no built-in or syntax newer than ES2023 (Chrome 111, Safari 16.4).
    files: ['packages/**/src/**/*.ts'],
    ignores: ['**/*.test.ts', 'packages/adapters/node/**'],
    extends: [esX.configs['flat/restrict-to-es2023']],
  },
  {
    files: ['**/*.test.ts', '*.config.ts', '**/vitest.config.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
