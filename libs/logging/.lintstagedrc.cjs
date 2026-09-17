// @ts-check

const { base } = require('../../.lintstagedrc.shared');

module.exports = {
  ...base,
  'log_event_ids.ts': ['pnpm build:generate_docs'],
};
