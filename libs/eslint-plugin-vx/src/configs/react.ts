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
    'react/function-component-definition': [
      'error',
      { namedComponents: 'function-declaration' },
    ],
    'react/jsx-filename-extension': ['error', { extensions: allExtensions }],
    'react/jsx-fragments': ['error', 'element'],
    'react/jsx-no-bind': [
      'error',
      { allowFunctions: true, allowArrowFunctions: true, allowBind: false },
    ],
    'react/jsx-no-useless-fragment': 'off',
    'react/jsx-one-expression-per-line': 'off',
    'react/jsx-props-no-spreading': 'off',
    'react/jsx-wrap-multilines': 'off',
    'react/prop-types': 'off',
    'react/require-default-props': 'off',
  },
};
