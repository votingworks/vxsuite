const jsExtensions = ['.js', '.jsx'];
const tsExtensions = ['.ts', '.tsx'];
const allExtensions = jsExtensions.concat(tsExtensions);

export = {
  parser: require.resolve('@typescript-eslint/parser'),
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
    'prettier', // Disables rules that conflict with Prettier
  ],
  plugins: ['@typescript-eslint/eslint-plugin', 'n', 'vx'],
  settings: {
    'import/extensions': allExtensions,
    'import/parsers': {
      '@typescript-eslint/parser': tsExtensions,
    },
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: ['./tsconfig.json'],
      },
      node: {
        extensions: allExtensions,
      },
    },
  },
  reportUnusedDisableDirectives: true,
  rules: {
    'n/prefer-node-protocol': 'error',
    // Enforce various custom lint rules to follow the recommendations of the Google TypeScript Style Guide.
    // See libs/eslint-plugin-vx/docs for more documentation on individual rules.
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
    // Importing types allows a package to list another package as a dev
    // dependency if only using the package's types. This makes it possible for
    // browser-based packages to import types from Node-based packages.
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

    // Enable various quality of life custom rules that increase readability and prevent bugs.
    // See libs/eslint-plugin-vx/docs for more documentation on individual rules.
    'vx/no-array-sort-mutation': 'error',
    'vx/no-assert-truthiness': 'error',
    'vx/no-floating-results': ['error', { ignoreVoid: true }],
    'vx/no-import-workspace-subfolders': 'error',

    // Disallow awaiting a value that is not Thenable which often indicates an error.
    '@typescript-eslint/await-thenable': 'error',
    // Enforce using interface as object type definition as recommended by Google TypeScript Style Guide.
    '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
    // Enforce explicit return types on exports for readability
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    // Overridden by vx/gts-no-array-constructor
    '@typescript-eslint/no-array-constructor': 'off',
    // Enforce handling promises appropriately to avoid potential bugs
    '@typescript-eslint/no-floating-promises': 'error',
    // Disallows the non-null assertion ! operator as recommended by the Google TypeScript Style Guide.
    '@typescript-eslint/no-non-null-assertion': 'error',
    // Disallows unnecessary type assertions as recommended by the Google TypeScript Style Guide.
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    // Disallows unused variables to prevent bugs
    '@typescript-eslint/no-unused-vars': 'error',
    // Enforce private properties are readonly as recommended by the Google TypeScript Style Guide.
    '@typescript-eslint/prefer-readonly': 'error',
    // Disallows async functions with no await to prevent bugs and confusion
    '@typescript-eslint/require-await': 'error',

    // Configure default rules as recommended by Google TypeScript Style Guide.
    'class-methods-use-this': 'off',
    'consistent-return': 'off',
    'dot-notation': 'off',
    // be stricter than eslint-config-airbnb which allows `== null`
    eqeqeq: ['error', 'always'],
    'import/extensions': 'off',
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
          // Update this to mirror CVR properties.
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
    'no-void': 'off', // allow silencing `no-floating-promises` with `void`
    'nonblock-statement-body-position': ['error', 'beside'],
    'prefer-arrow-callback': 'error',

    // replace some built-in rules that don't play well with TypeScript, with Typescript-aware versions
    '@typescript-eslint/no-shadow': 'error',
    'no-shadow': 'off',
    '@typescript-eslint/no-use-before-define': 'error',
    'no-use-before-define': 'off',
    '@typescript-eslint/no-useless-constructor': 'error',
    'no-useless-constructor': 'off',
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-loop-func': 'off',
        'vx/gts-direct-module-export-access-only': 'off',
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      plugins: ['jest'],
      rules: {
        'jest/max-nested-describe': ['error', { max: 1 }],
        'jest/no-identical-title': 'error',
        'jest/no-focused-tests': 'error',
        'jest/valid-expect': ['error', { alwaysAwait: true }],
        'vx/no-jest-to-be': 'error',
      },
    },
    {
      files: ['**/*.stories.ts', '**/*.stories.tsx'],
      rules: {
        // Default exports are required in the Common Story Format (CSF) used by storybook.js
        'vx/gts-no-default-exports': 'off',
      },
    },
  ],
};
