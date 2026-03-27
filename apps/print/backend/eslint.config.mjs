import { recommended } from 'eslint-plugin-vx';

export default [
  { ignores: ['scripts/**'] },
  ...recommended,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
];
