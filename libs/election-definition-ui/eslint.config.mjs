import { react, ignores } from 'eslint-plugin-vx';

export default [
  { ignores: ignores.frontend },
  ...react,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
];
