import { react, ignores } from 'eslint-plugin-vx';

export default [
  { ignores: ignores.frontend },
  ...react,
  {
    rules: {
      'vx/gts-jsdoc': 'off',
      // Polling must go through usePollingQuery so that any number of
      // components can subscribe to a polled query without multiplying the
      // request rate.
      'vx/no-refetch-interval': 'error',
    },
  },
];
