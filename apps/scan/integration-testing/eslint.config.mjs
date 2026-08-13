import { recommended, ignores } from 'eslint-plugin-vx';

export default [
  { ignores: [...ignores.integrationTesting, '!playwright.config.ts'] },
  ...recommended,
  {
    files: ['playwright.config.ts'],
    rules: {
      'vx/gts-no-default-exports': 'off',
      'vx/gts-identifiers': ['error', { allowedNames: ['baseURL'] }],
    },
  },
];
