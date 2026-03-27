import { recommended } from 'eslint-plugin-vx';

export default [
  ...recommended,
  {
    rules: {
      'vx/gts-identifiers': ['error', { allowedNames: ['/CVR.*/'] }],
    },
  },
  {
    files: ['test/*'],
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
];
