const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coveragePathIgnorePatterns: [
    'src/cypress.ts',
    'src/index.ts',
    'src/intermediate-scripts',
    'src/jurisdictions.ts',
    'src/test_utils.ts',
  ],
};
