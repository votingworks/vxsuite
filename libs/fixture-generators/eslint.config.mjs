import { recommended } from 'eslint-plugin-vx';

export default [
  { ignores: ['bin/**'] },
  ...recommended,
  {
    rules: {
      'vx/gts-identifiers': ['error', { allowedNames: ['/CVR.*/'] }],
    },
  },
];
