const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coveragePathIgnorePatterns: [
    'src/cac/index.ts',
    'src/index.ts',
    'src/integration_test_utils.ts',
    'src/intermediate-scripts',
    'src/jurisdictions.ts',
    'src/test_utils.ts',
  ],
};
