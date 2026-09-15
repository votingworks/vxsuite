import { recommended } from 'eslint-plugin-vx';

export default [
  { ignores: ['*.js'] },
  ...recommended,
  {
    files: ['scripts/**', 'src/scripts/**'],
    rules: {
      'no-console': 'off',
    },
  },
];
