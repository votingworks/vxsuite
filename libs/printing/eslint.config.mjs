import { recommended } from 'eslint-plugin-vx';

export default [
  ...recommended,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
  {
    files: ['scripts/**'],
    rules: {
      'no-console': 'off',
    },
  },
];
