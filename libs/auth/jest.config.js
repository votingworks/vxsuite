const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coveragePathIgnorePatterns: [
    'src/create_cert.ts',
    'src/cypress.ts',
    'src/index.ts',
    'src/jurisdictions.ts',
    'src/test_utils.ts',
    'test/utils.ts,',
  ],
};
