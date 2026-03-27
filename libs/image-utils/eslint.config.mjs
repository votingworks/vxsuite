import { recommended } from 'eslint-plugin-vx';

export default [
  { ignores: ['bin/**'] },
  ...recommended,
  {
    rules: {
      'no-bitwise': 'off',
      'vx/gts-identifiers': ['error', { allowedNames: ['/.*(X|Y)Offset/'] }],
    },
  },
];
