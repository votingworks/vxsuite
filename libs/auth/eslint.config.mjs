import { recommended } from 'eslint-plugin-vx';

export default [
  { ignores: ['*.js'] },
  ...recommended,
  {
    files: ['scripts/**'],
    rules: {
      'no-console': 'off',
    },
  },
];
