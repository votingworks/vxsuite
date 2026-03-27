import type { Linter } from 'eslint';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import pluginN from 'eslint-plugin-n';
import pluginVitest from 'eslint-plugin-vitest';
import { FlatCompat } from '@eslint/eslintrc';
import type { VxPlugin } from '../index';

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * Build the "recommended" flat config array for a given instance of the vx
 * plugin.  The caller must pass the plugin object so that the config can
 * reference the plugin's rules without creating a circular dependency.
 */
export default function buildRecommended(plugin: VxPlugin): Linter.Config[] {
  const vxPlugin = {
    rules: plugin.rules,
  };

  return [
    // ── Global ignores ────────────────────────────────────────────
    // These files are present in every workspace package but are not
    // source code and/or are outside the tsconfig project scope.
    {
      ignores: [
        'build/**',
        'coverage/**',
        '*.config.ts',
        '*.config.mts',
        '*.config.js',
        '*.config.mjs',
        // Dotfile tooling configs (lint-staged, prettier, stylelint, etc.)
        '.*rc*.js',
        // Type declaration files are not normal source code.
        '**/*.d.ts',
      ],
    },

    // ── Base configs ──────────────────────────────────────────────
    js.configs.recommended,

    // airbnb-base via compat (it has no flat-config export)
    ...compat.extends('airbnb-base'),

    // typescript-eslint recommended (includes parser setup)
    ...(tseslint.configs.recommended as Linter.Config[]),

    // ── Main config ───────────────────────────────────────────────
    {
      plugins: {
        vx: vxPlugin,
        n: pluginN as unknown as Record<string, unknown>,
      },
      languageOptions: {
        parserOptions: {
          ecmaFeatures: { jsx: true },
          projectService: true,
        },
      },
      settings: {
        'import/extensions': ['.js', '.jsx', '.ts', '.tsx'],
        'import/parsers': {
          '@typescript-eslint/parser': ['.ts', '.tsx'],
        },
        'import/resolver': {
          typescript: {
            alwaysTryTypes: true,
            project: ['./tsconfig.json'],
          },
          node: {
            extensions: ['.js', '.jsx', '.ts', '.tsx'],
          },
        },
      },
      linterOptions: {
        reportUnusedDisableDirectives: 'error',
      },
      rules: {
        'n/prefer-node-protocol': 'error',

        // ── VX / GTS rules ──────────────────────────────────────
        'vx/gts-array-type-style': 'error',
        'vx/gts-constants': 'error',
        'vx/gts-direct-module-export-access-only': 'error',
        'vx/gts-func-style': 'error',
        'vx/gts-jsdoc': 'error',
        'vx/gts-identifiers': 'error',
        'vx/gts-module-snake-case': 'error',
        'vx/gts-no-array-constructor': 'error',
        'vx/gts-no-const-enum': 'error',
        'vx/gts-no-default-exports': 'error',
        'vx/gts-no-foreach': 'error',
        'vx/gts-no-for-in-loop': 'error',
        'vx/gts-no-import-export-type': 'off',
        'vx/gts-no-private-fields': 'error',
        'vx/gts-no-public-class-fields': 'error',
        'vx/gts-no-public-modifier': 'error',
        'vx/gts-no-return-type-only-generics': 'error',
        'vx/gts-no-unnecessary-has-own-property-check': 'warn',
        'vx/gts-object-literal-types': 'error',
        'vx/gts-parameter-properties': 'error',
        'vx/gts-safe-number-parse': 'error',
        'vx/gts-spread-like-types': 'error',
        'vx/gts-type-parameters': 'error',
        'vx/gts-unicode-escapes': 'error',
        'vx/gts-use-optionals': 'error',

        // ── VX quality rules ────────────────────────────────────
        'vx/no-array-sort-mutation': 'error',
        'vx/no-assert-truthiness': 'error',
        'vx/no-assert-result-predicates': 'error',
        'vx/no-floating-results': ['error', { ignoreVoid: true }],
        'vx/no-import-workspace-subfolders': 'error',
        'vx/no-manual-sleep': 'error',

        // ── @typescript-eslint ──────────────────────────────────
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/consistent-type-definitions': [
          'error',
          'interface',
        ],
        '@typescript-eslint/explicit-module-boundary-types': 'error',
        '@typescript-eslint/no-array-constructor': 'off',
        // require() is used intentionally in some places (e.g. better-sqlite3).
        '@typescript-eslint/no-require-imports': 'off',
        // Empty interfaces extending a type are an intentional pattern for
        // creating named types from Zod schemas etc.
        '@typescript-eslint/no-empty-object-type': 'off',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/no-unnecessary-type-assertion': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { caughtErrors: 'none' },
        ],
        '@typescript-eslint/prefer-readonly': 'error',
        '@typescript-eslint/require-await': 'error',

        // ── Core / airbnb overrides ─────────────────────────────
        'class-methods-use-this': 'off',
        'consistent-return': 'off',
        'dot-notation': 'off',
        eqeqeq: ['error', 'always'],
        'import/extensions': 'off',
        'import/no-cycle': process.env['CI'] ? 'error' : 'off',
        'import/no-extraneous-dependencies': [
          'error',
          {
            devDependencies: [
              '**/*.test.ts',
              '**/*.test.tsx',
              'test/**/*',
              'src/setupTests.ts',
              'src/setupTests.tsx',
              '**/*.stories.ts',
              '**/*.stories.tsx',
              '**/test_utils.ts',
              '**/test_utils.tsx',
              '**/*.bench.ts',
            ],
          },
        ],
        'import/no-self-import': 'off',
        'import/no-unresolved': 'off',
        'import/namespace': 'off',
        'import/default': 'off',
        'import/no-named-as-default-member': 'off',
        'import/prefer-default-export': 'off',
        'lines-between-class-members': 'off',
        'no-await-in-loop': 'off',
        'no-continue': 'off',
        'no-empty-function': 'off',
        'no-nested-ternary': 'off',
        'no-restricted-globals': ['error', 'Buffer'],
        'no-restricted-syntax': 'off',
        'no-return-await': 'off',
        'no-underscore-dangle': [
          'error',
          {
            allow: [
              '_precinctId',
              '_ballotId',
              '_ballotStyleId',
              '_ballotType',
              '_batchId',
              '_batchLabel',
              '_testBallot',
              '_scannerId',
            ],
          },
        ],
        'no-void': 'off',
        'nonblock-statement-body-position': ['error', 'beside'],
        'prefer-arrow-callback': 'error',

        '@typescript-eslint/no-shadow': 'error',
        'no-shadow': 'off',
        '@typescript-eslint/no-use-before-define': [
          'error',
          { functions: false },
        ],
        'no-use-before-define': 'off',
        '@typescript-eslint/no-useless-constructor': 'error',
        'no-useless-constructor': 'off',

        // TypeScript handles this better than ESLint's no-undef.
        'no-undef': 'off',
        // Disable base rules that conflict with @typescript-eslint equivalents.
        'no-unused-vars': 'off',
        'no-redeclare': 'off',
      },
    },

    // Prettier must come last to turn off conflicting style rules.
    eslintConfigPrettier,

    // ── Test file overrides ───────────────────────────────────────
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      plugins: {
        vitest: pluginVitest,
      },
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-loop-func': 'off',
        'vx/gts-direct-module-export-access-only': 'off',

        'vitest/no-commented-out-tests': 'error',
        'vitest/no-identical-title': 'error',
        'vitest/no-import-node-test': 'error',
        'vitest/require-local-test-context-for-concurrent-snapshots': 'error',
        'vitest/valid-describe-callback': 'error',
        'vitest/valid-expect': 'error',
        'vitest/valid-title': 'error',
        'vitest/no-focused-tests': 'error',

        'vx/no-expect-to-be': 'error',
      },
    },

    // ── Storybook file overrides ──────────────────────────────────
    {
      files: ['**/*.stories.ts', '**/*.stories.tsx'],
      rules: {
        'vx/gts-no-default-exports': 'off',
      },
    },
  ];
}
