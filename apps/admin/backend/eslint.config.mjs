import { recommended } from 'eslint-plugin-vx';

export default [
  ...recommended,
  {
    rules: {
      'vx/gts-identifiers': ['error', { allowedNames: ['/CVR.*/'] }],
    },
  },
  {
    files: ['perf/**'],
    rules: {
      'vx/gts-jsdoc': 'off',
      'vx/gts-safe-number-parse': 'off',
      'no-bitwise': 'off',
      'no-console': 'off',
      'import/no-extraneous-dependencies': 'off',
    },
  },
  {
    files: ['test/*'],
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
];
