const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coveragePathIgnorePatterns: ['./test/helpers/*', './src/cdf/election-results-reporting/types.ts'],
};
