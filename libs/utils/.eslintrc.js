module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    'plugin:vx/all',
  ],
  parser: '@typescript-eslint/parser',
  plugins: [
    'prettier',
    '@typescript-eslint/eslint-plugin',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: 'tsconfig.test.json'
  },
  env: {
    jest: true,
    es6: true,
    node: true,
    browser: true,
  },
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/camelcase': 'off',
    'no-dupe-class-members': 'off',
    '@typescript-eslint/no-dupe-class-members': ['error'],
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
}
