const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: [
    '<rootDir>/src/rules/*.ts',
    '!<rootDir>/src/rules/index.ts',
  ],
};
