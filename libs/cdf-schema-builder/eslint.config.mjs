import { recommended } from 'eslint-plugin-vx';

export default [
  ...recommended,
  {
    files: ['**/*.test.ts'],
    rules: {
      'vx/gts-identifiers': [
        'error',
        { allowedNames: ['$schema', '$id', '$ref'] },
      ],
    },
  },
];
