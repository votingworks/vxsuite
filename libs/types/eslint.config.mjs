import { recommended } from 'eslint-plugin-vx';

export default [
  { ignores: ['*.js'] },
  ...recommended,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
  {
    files: [
      'src/cdf/cast-vote-records/*.ts',
      'src/cdf_cast_vote_records.ts',
      'src/cast_vote_records.ts',
    ],
    rules: {
      'vx/gts-identifiers': ['error', { allowedNames: ['/CVR.*/'] }],
    },
  },
];
