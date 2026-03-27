import { recommended } from 'eslint-plugin-vx';

export default [
  ...recommended,
  {
    rules: {
      'no-bitwise': 'off',
      'vx/gts-jsdoc': 'off',
    },
  },
];
