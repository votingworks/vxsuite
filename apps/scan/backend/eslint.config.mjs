import { recommended } from 'eslint-plugin-vx';

export default [
  { ignores: ['public/vendor/**'] },
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
