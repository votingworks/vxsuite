import { react, ignores } from 'eslint-plugin-vx';
import storybook from 'eslint-plugin-storybook';

export default [
  { ignores: [...ignores.frontend, '.storybook/**'] },
  ...react,
  ...storybook.configs['flat/recommended'],
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
];
