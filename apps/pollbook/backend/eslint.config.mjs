import { recommended } from 'eslint-plugin-vx';

export default [
  { ignores: ['scripts/**'] },
  ...recommended,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
  {
    files: ['src/scripts/**'],
    rules: {
      'no-console': 'off',
      // Dev-only scripts may use devDependencies.
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
];
