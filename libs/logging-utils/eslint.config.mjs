import { recommended } from 'eslint-plugin-vx';

export default [
  { ignores: ['index.js', 'index.d.ts'] },
  ...recommended,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
];
