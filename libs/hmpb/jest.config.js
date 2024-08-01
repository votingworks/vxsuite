const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      branches: -16,
      lines: -30,
    },
  },
  coveragePathIgnorePatterns: [
    'src/index.ts',
    'src/generate_fixtures.ts',
    'src/ballot_fixtures.ts',
    'src/all_bubble_ballot_fixtures.ts',
    'src/concatenate_pdfs.ts',
    'src/preview/*',
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
};
