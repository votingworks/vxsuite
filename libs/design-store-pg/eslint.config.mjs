import { recommended } from 'eslint-plugin-vx';

export default [
  ...recommended,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
  {
    files: ['migrations/**'],
    rules: {
      'vx/gts-module-snake-case': 'off',
    },
  },
];
