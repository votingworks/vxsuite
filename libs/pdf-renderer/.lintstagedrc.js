// @ts-check

const { base } = require('../../.lintstagedrc.shared');

module.exports = {
  ...base,
  '*.rs': ['bash -c  "cargo clippy"'],
};
