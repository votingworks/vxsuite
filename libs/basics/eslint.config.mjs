import { recommended } from 'eslint-plugin-vx';

export default [
  ...recommended,
  {
    rules: {
      'vx/no-assert-result-predicates': 'off',
    },
  },
];
