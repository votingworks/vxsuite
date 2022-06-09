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
    '!src/precinct_scanner_polls_report.tsx',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
};
