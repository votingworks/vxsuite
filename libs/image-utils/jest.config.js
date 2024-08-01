const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coveragePathIgnorePatterns: ['src/jest_pdf_snapshot.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
};
