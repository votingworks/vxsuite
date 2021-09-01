const jsExtensions = ['.js', '.jsx']
const tsExtensions = ['.ts', '.tsx']
const allExtensions = jsExtensions.concat(tsExtensions)

export = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2018,
    project: ['./tsconfig.json'],
    sourceType: 'module',
  },
  extends: [
    'airbnb-base',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended', // Uses the recommended rules from @typescript-eslint/eslint-plugin
    'plugin:prettier/recommended', // Enables eslint-plugin-prettier and displays prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
  ],
  plugins: ['@typescript-eslint/eslint-plugin', 'vx'],
  settings: {
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
  reportUnusedDisableDirectives: true,
  rules: {
    'vx/no-array-sort-mutation': 'error',
    'vx/no-assert-truthiness': 'error',
    'vx/no-floating-results': ['error', { ignoreVoid: true }],
    'vx/use-array-from-with-map': 'error',

    '@typescript-eslint/no-extra-semi': 'off',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    'class-methods-use-this': 'off',
    'consistent-return': 'off',
    'import/extensions': 'off',
    'import/no-cycle': 'off',
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: [
          '**/*.test.ts',
          '**/*.test.tsx',
          'test/**/*',
          'src/setupTests.ts',
          'src/setupTests.tsx',
          'cypress/**/*',
        ],
      },
    ],
    'import/no-self-import': 'off',
    'import/prefer-default-export': 'off',
    'lines-between-class-members': 'off',
    'no-await-in-loop': 'off',
    'no-continue': 'off',
    'no-nested-ternary': 'off',
    'no-restricted-syntax': 'off',
    'no-return-await': 'off',
    'no-underscore-dangle': [
      'error',
      {
        allow: [
          // Update this to mirror CVR properties.
          '_precinctId',
          '_ballotId',
          '_ballotStyleId',
          '_ballotType',
          '_batchId',
          '_batchLabel',
          '_testBallot',
          '_scannerId',
          '_pageNumber',
          '_pageNumbers',
          '_locales',
        ],
      },
    ],
    'no-void': 'off', // allow silencing `no-floating-promises` with `void`

    // replace some built-in rules that don't play well with TypeScript
    '@typescript-eslint/no-shadow': 'error',
    'no-shadow': 'off',
    '@typescript-eslint/no-use-before-define': 'error',
    'no-use-before-define': 'off',
    '@typescript-eslint/no-useless-constructor': 'error',
    'no-useless-constructor': 'off',
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx', 'cypress/**/*.ts'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-loop-func': 'off',
      },
    },
  ],
}
