const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  testMatch: ['<rootDir>/ts/**/*.test.ts'],
  collectCoverageFrom: [
    '<rootDir>/ts/**/*.ts',
    '!<rootDir>/**/*.d.ts',
    '!<rootDir>/ts/src/cli.ts',
  ],
};
