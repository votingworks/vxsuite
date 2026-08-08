// @ts-check

const { frontend } = require('../../.lintstagedrc.shared');

module.exports = {
  ...frontend,
  '(app_strings.tsx|number_strings.ts|finalize_app_strings_catalog.ts)': [
    'pnpm build:app-strings-catalog',
  ],
};
