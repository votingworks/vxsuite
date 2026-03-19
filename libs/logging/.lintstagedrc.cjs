// @ts-check

const { base } = require('../../.lintstagedrc.shared.cjs');

module.exports = {
  ...base,
  'log_event_ids.ts': ['pnpm build:generate_docs'],
};
