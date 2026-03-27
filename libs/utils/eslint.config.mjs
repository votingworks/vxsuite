import { recommended } from 'eslint-plugin-vx';

export default [
  ...recommended,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
      'vx/gts-identifiers': [
        'error',
        { allowedNames: ['/CVR.*/', '/buildCVR.*/', 'toJSON'] },
      ],
    },
  },
];
