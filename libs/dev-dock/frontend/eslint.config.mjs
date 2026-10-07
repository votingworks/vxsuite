import { react } from 'eslint-plugin-vx';

export default [
  ...react,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
];
