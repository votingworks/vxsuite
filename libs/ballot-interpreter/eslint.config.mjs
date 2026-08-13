import { recommended } from 'eslint-plugin-vx';

export default [
  // Generated N-API loader shim.
  { ignores: ['index.js'] },
  ...recommended,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
];
