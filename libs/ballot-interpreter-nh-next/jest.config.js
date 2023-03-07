const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  // look for tests in the `ts` directory
  testMatch: ['<rootDir>/ts/**/*.test.ts'],
};
