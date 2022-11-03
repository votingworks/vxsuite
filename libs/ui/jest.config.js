const shared = require('../../jest.config.shared')

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  testEnvironment: 'jsdom',
  collectCoverageFrom: [ 
    ...shared.collectCoverageFrom,
    '!src/contest_tally.tsx',
      '!src/config/features.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
};
