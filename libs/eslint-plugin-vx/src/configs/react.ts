// FIXME: change to standard ES import once we move to ESLint flat config
// eslint-disable-next-line @typescript-eslint/no-require-imports
import recommended = require('./recommended');

const jsExtensions = ['.js', '.jsx'];
const tsExtensions = ['.ts', '.tsx'];
const allExtensions = jsExtensions.concat(tsExtensions);

export = {
  ...recommended,
  extends: [
    ...recommended.extends
      .map((name) => (name === 'airbnb-base' ? 'airbnb' : name))
      .filter((name) => name !== 'plugin:prettier/recommended'),
    'airbnb/hooks',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:jsx-a11y/recommended',
    'plugin:prettier/recommended', // Enables eslint-plugin-prettier and displays prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
  ],
  settings: {
    ...recommended.settings,
    react: {
      version: 'detect',
    },
  },
  rules: {
    ...recommended.rules,
    'jsx-a11y/label-has-associated-control': [
      'error',
      {
        controlComponents: ['Select'],
      },
    ],
    'react/jsx-filename-extension': ['error', { extensions: allExtensions }],
    'react/jsx-fragments': ['error', 'element'],
    'react/jsx-no-bind': 'off',
    'react/jsx-no-constructed-context-values': 'off',
    'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
    'react/jsx-one-expression-per-line': 'off',
    'react/jsx-props-no-spreading': 'off',
    'react/jsx-wrap-multilines': 'off',
    'react/prop-types': 'off',
    'react/require-default-props': 'off',
    'vx/no-react-hook-mutation-dependency': 'error',
  },
};
