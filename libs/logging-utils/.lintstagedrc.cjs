// @ts-check

const { base } = require('../../.lintstagedrc.shared.cjs');

module.exports = {
  ...base,
  '*.rs': ['bash -c  "cargo clippy"'],
};
