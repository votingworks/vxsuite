import { recommended } from 'eslint-plugin-vx';

export default [
  {
    ignores: [
      '*.csv.ts',
      '*.jpeg.ts',
      '*.json.ts',
      '*.jsonl.ts',
      '*.txt.ts',
      '*.zip.ts',
    ],
  },
  ...recommended,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
];
