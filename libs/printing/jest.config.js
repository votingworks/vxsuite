const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
  coveragePathIgnorePatterns: [
    'src/index.ts',
    'src/chromium.ts',
    'src/printer/cli.ts',
  ],
};
