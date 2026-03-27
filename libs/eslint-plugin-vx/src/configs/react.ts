import type { Linter } from 'eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import { FlatCompat } from '@eslint/eslintrc';
import globals from 'globals';
import type { VxPlugin } from '../index';
import buildRecommended from './recommended';

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * Build the "react" flat config array for a given instance of the vx plugin.
 */
export default function buildReact(plugin: VxPlugin): Linter.Config[] {
  const recommended = buildRecommended(plugin);

  // Extract the main config from recommended to merge rules
  const mainConfig = recommended.find((c) => c.plugins && 'vx' in c.plugins)!;

  const isPrettier = (c: Linter.Config): boolean => c === eslintConfigPrettier;

  // Separate configs that have `files` patterns (overrides for test/storybook
  // files) from base configs.  Overrides must come last so they win in flat
  // config's last-match-wins semantics.
  const overrideConfigs = recommended.filter(
    (c) => c !== mainConfig && !isPrettier(c) && c.files
  );
  const baseConfigs = recommended.filter(
    (c) => c !== mainConfig && !isPrettier(c) && !c.files
  );

  return [
    // Base configs from recommended (ignores, js, airbnb-base, ts-eslint, etc.)
    ...baseConfigs,

    // airbnb (includes react, react hooks, jsx-a11y rules) via compat
    ...compat.extends('airbnb', 'airbnb/hooks'),

    // ── Main config with react additions ──────────────────────────
    {
      ...mainConfig,
      plugins: {
        ...mainConfig.plugins,
        'react-hooks': pluginReactHooks,
      },
      languageOptions: {
        ...mainConfig.languageOptions,
        globals: {
          ...globals.browser,
        },
      },
      settings: {
        ...mainConfig.settings,
        react: {
          version: 'detect',
        },
      },
      rules: {
        ...mainConfig.rules,

        'jsx-a11y/control-has-associated-label': 'off',
        'jsx-a11y/label-has-associated-control': [
          'error',
          {
            controlComponents: ['Select'],
          },
        ],
        'react/jsx-filename-extension': [
          'error',
          { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
        ],
        'react/jsx-fragments': ['error', 'element'],
        'react/jsx-no-bind': 'off',
        'react/jsx-no-constructed-context-values': 'off',
        'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
        'react/jsx-one-expression-per-line': 'off',
        'react/jsx-props-no-spreading': 'off',
        'react/jsx-wrap-multilines': 'off',
        'react/prop-types': 'off',
        'react/react-in-jsx-scope': 'off',
        'react/require-default-props': 'off',
        'vx/no-react-hook-mutation-dependency': 'error',
        'no-restricted-globals': [
          'error',
          'Buffer',
          'close',
          'open',
          'alert',
          'confirm',
          'prompt',
          'print',
        ],
      },
    },

    // Overrides for test/storybook files — must come after main config
    // so they win in flat config's last-match-wins semantics.
    ...overrideConfigs,

    // Prettier must come last to turn off conflicting style rules.
    eslintConfigPrettier,
  ];
}
