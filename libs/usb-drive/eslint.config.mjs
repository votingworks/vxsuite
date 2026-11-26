import { recommended } from 'eslint-plugin-vx';

export default [
  ...recommended,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
  {
    files: ['src/mocks/memory_usb_drive.ts'],
    rules: {
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
];
