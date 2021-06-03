const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: [
    '<rootDir>/src/rules/*.ts',
    '!<rootDir>/src/rules/index.ts',
  ],
}
