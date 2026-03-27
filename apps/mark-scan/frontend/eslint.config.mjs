import { react, ignores } from 'eslint-plugin-vx';

export default [
  { ignores: [...ignores.frontend, 'codemods/**', 'script/**/*.js'] },
  ...react,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
];
