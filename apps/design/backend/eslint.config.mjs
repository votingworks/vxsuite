import { recommended } from 'eslint-plugin-vx';

export default [
  ...recommended,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
  {
    files: ['scripts/**', 'src/scripts/**'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['migrations/**'],
    rules: {
      'vx/gts-module-snake-case': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // The migrations/ dir has its own package.json ("type": "commonjs") to
      // stay CJS under the package's "type": "module"; it has no dependencies
      // field, so this rule would otherwise flag the backend deps the
      // migrations legitimately use.
      'import/no-extraneous-dependencies': 'off',
    },
  },
];
