const jsExtensions = ['.js', '.jsx']
const tsExtensions = ['.ts', '.tsx']
const allExtensions = jsExtensions.concat(tsExtensions)

module.exports = {
  env: {
    browser: true,
    node: true,
    es6: true,
    'jest/globals': true,
  },
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  extends: [
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended', // Uses the recommended rules from @typescript-eslint/eslint-plugin
    'prettier/@typescript-eslint', // Uses eslint-config-prettier to disable ESLint rules from @typescript-eslint/eslint-plugin that would conflict with prettier
    'plugin:prettier/recommended', // Enables eslint-plugin-prettier and displays prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
    'plugin:react/recommended', // Uses the recommended rules from @eslint-plugin-react
    'plugin:jsx-a11y/recommended',
    'prettier/react', // Overrides some of the rules in 'airbnb' to have more relaxed formatting in react.
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2018,
    project: './tsconfig.json',
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint',
    'jest',
    'no-null',
    'react',
    'jsx-a11y',
    'no-array-sort-mutation',
  ],
  settings: {
    react: {
      version: 'detect', // Tells eslint-plugin-react to automatically detect the version of React to use
    },
    'import/extensions': allExtensions,
    'import/parsers': {
      '@typescript-eslint/parser': tsExtensions,
    },
    'import/resolver': {
      node: {
        extensions: allExtensions,
      },
    },
  },
  rules: {
    camelcase: 'error',
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        js: 'never',
        jsx: 'never',
        ts: 'never',
        tsx: 'never'
      }
   ],
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: true,
      },
    ],
    'no-array-sort-mutation/no-array-sort-mutation': 'error',
    'no-unused-vars': 'off', // base rule must be disabled as it can report incorrect errors: https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-unused-vars.md#options
    '@typescript-eslint/no-unused-vars': ['error', {
      'vars': 'all'
    }],
    'no-use-before-define': 'off', // base rule must be disabled as it can report incorrect errors: https://github.com/typescript-eslint/typescript-eslint/issues/2540
    '@typescript-eslint/no-use-before-define': 'error',
    'no-null/no-null': 2, // TypeScript with strictNullChecks
    'react/destructuring-assignment': 'off',
    'react/jsx-boolean-value': [2, 'never'],
    'react/jsx-filename-extension': [
      1,
      { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
    ],
    'react/prop-types': 'off',
    strict: 0,
    '@typescript-eslint/explicit-function-return-type': 'off', // Want to use it, but it requires return types for all built-in React lifecycle methods.
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
}
