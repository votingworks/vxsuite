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
    'plugin:jest/recommended',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
    // fetch: true, // required if using via 'jest-fetch-mock'
    fetchMock: true, // required if using via 'jest-fetch-mock'
    BigInt: true,
  },
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2018,
    project: ['./tsconfig.json', './public/tsconfig.json'],
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'jest'],
  settings: {
    'import/parsers': {
      '@typescript-eslint/parser': tsExtensions,
    },
    'import/resolver': {
      node: {
        extensions: allExtensions,
      },
    },
  },
  reportUnusedDisableDirectives: true,
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-dupe-class-members': 'off',
    'no-unused-vars': 'off', // base rule must be disabled as it can report incorrect errors: https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-unused-vars.md#options
    'no-underscore-dangle': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        vars: 'all',
      },
    ],
    camelcase: 'error',
    'consistent-return': 'off',
    'import/extensions': ['error', 'never', { '.json': 'always' }],
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: true,
      },
    ],
    'lines-between-class-members': 'off',
    strict: 0,
  },
  overrides: [
    {
      files: '**/*.d.ts',
      rules: {
        'import/no-extraneous-dependencies': 'off',
      },
    },
    {
      files: 'public/**/*.js',
      globals: {
        React: true,
        ReactDOM: true,
        h: true,
      },
      rules: {
        'import/extensions': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
      },
    },
  ],
}
