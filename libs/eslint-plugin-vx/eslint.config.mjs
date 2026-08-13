import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { recommended } from 'eslint-plugin-vx';

export default [
  // Fixture files intentionally violate naming rules under test.
  { ignores: ['tests/fixtures/**'] },
  ...recommended,
  {
    rules: {
      'vx/gts-identifiers': [
        'error',
        { allowedNames: Object.keys(AST_NODE_TYPES) },
      ],
      'vx/gts-jsdoc': 'off',
      'vx/gts-no-default-exports': 'off',
    },
  },
  {
    files: ['tests/**/*'],
    rules: {
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
];
