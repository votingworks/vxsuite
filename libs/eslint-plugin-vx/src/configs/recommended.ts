import type { Linter } from 'eslint';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import pluginN from 'eslint-plugin-n';
import pluginVitest from 'eslint-plugin-vitest';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { FlatCompat } from '@eslint/eslintrc';
import type { VxPlugin } from '../index';

const compat = new FlatCompat({ baseDirectory: __dirname });

/** TypeScript source extensions, for rules that must not apply to JS files. */
const TS_FILES = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];

export interface RecommendedOptions {
  /**
   * Include the React/JSX layer: the full airbnb config instead of airbnb-base,
   * plus the react, react-hooks and jsx-a11y recommended rule sets.
   */
  react?: boolean;
}

/**
 * Build the "recommended" flat config array for a given instance of the vx
 * plugin. The caller must pass the plugin object so that the config can
 * reference the plugin's rules without creating a circular dependency.
 */
export default function buildRecommended(
  plugin: VxPlugin,
  { react = false }: RecommendedOptions = {}
): Linter.Config[] {
  const vxPlugin: VxPlugin = {
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
        '**/*.config.ts',
        '**/*.config.mts',
        '**/*.config.js',
        '**/*.config.mjs',
        // Re-enable playwright.config.ts so integration-testing overrides work.
        '!playwright.config.ts',
        // Dotfile tooling configs (lint-staged, prettier, stylelint, etc.)
        '.lintstagedrc.js',
        '.lintstagedrc.cjs',
        '.lintstagedrc.shared.js',
        '.pnpmfile.cjs',
        '.prettierrc.js',
        '.stylelintrc.js',
        '.stylelintrc.cjs',
        '.stylelintrc-css.js',
        '.stylelintrc-css.cjs',
        // Type declaration files are not normal source code.
        '**/*.d.ts',
      ],
    },

    // ── Base configs ──────────────────────────────────────────────
    js.configs.recommended,

    // airbnb via compat (it has no flat-config export). This must come before
    // typescript-eslint so that typescript-eslint wins where it disables a core
    // rule in favor of its own type-aware equivalent.
    ...compat.extends(
      ...(react ? ['airbnb', 'airbnb/hooks'] : ['airbnb-base'])
    ),

    // typescript-eslint recommended (includes parser setup)
    ...(tseslint.configs.recommended as Linter.Config[]),

    // ── React layer ───────────────────────────────────────────────
    // These come after airbnb (whose react/jsx-a11y rules they refine) but
    // before the main config, which has the final say. Routed through compat
    // for the same reason as airbnb: neither plugin's flat-config export covers
    // `jsx-runtime`, which disables the rules the React 17+ transform obsoletes.
    ...(react
      ? compat.extends(
          'plugin:react/recommended',
          'plugin:react/jsx-runtime',
          'plugin:jsx-a11y/recommended'
        )
      : []),

    // ── Main config ───────────────────────────────────────────────
    {
      plugins: {
        vx: vxPlugin,
        n: pluginN as unknown as Record<string, unknown>,
        ...(react
          ? {
              'react-hooks': pluginReactHooks,
            }
          : {}),
      },
      languageOptions: {
        parserOptions: {
          ecmaFeatures: { jsx: true },
          projectService: true,
        },
        ...(react ? { globals: { ...globals.browser } } : {}),
      },
      settings: {
        ...(react ? { react: { version: 'detect' } } : {}),
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
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            // typescript-eslint v8 changed the default from 'none' to 'all';
            // keep the pre-v8 behavior of ignoring unused catch bindings.
            caughtErrors: 'none',
          },
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
        // TypeScript verifies named imports itself; the import plugin can't
        // see type-only exports (mirrors `plugin:import/typescript`).
        'import/named': 'off',
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
        'no-restricted-globals': react
          ? [
              'error',
              'Buffer',
              'close',
              'open',
              'alert',
              'confirm',
              'prompt',
              'print',
            ]
          : ['error', 'Buffer'],
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

        // Disable base rules that conflict with @typescript-eslint equivalents.
        'no-unused-vars': 'off',

        // ── React ───────────────────────────────────────────────
        ...(react
          ? {
              'jsx-a11y/control-has-associated-label': 'off',
              'jsx-a11y/label-has-associated-control': [
                'error',
                { controlComponents: ['Select'] },
              ],
              'react/jsx-filename-extension': [
                'error',
                { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
              ],
              'react/jsx-fragments': ['error', 'element'],
              'react/jsx-no-bind': 'off',
              'react/jsx-no-constructed-context-values': 'off',
              'react/jsx-no-useless-fragment': [
                'error',
                { allowExpressions: true },
              ],
              'react/jsx-one-expression-per-line': 'off',
              'react/jsx-props-no-spreading': 'off',
              'react/jsx-wrap-multilines': 'off',
              'react/prop-types': 'off',
              'react/require-default-props': 'off',
              'vx/no-react-hook-mutation-dependency': 'error',
            }
          : {}),
      },
    },

    // ── TypeScript-only core rule disables ────────────────────────
    // TypeScript itself catches these, but plain JS files still need them.
    {
      files: TS_FILES,
      rules: {
        'no-undef': 'off',
        'no-redeclare': 'off',
      },
    },

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

    // Prettier must come last to turn off conflicting style rules.
    eslintConfigPrettier,
  ];
}
