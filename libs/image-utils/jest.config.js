const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coveragePathIgnorePatterns: [
    'src/jest_pdf_snapshot.ts',
    'src/cli/pdf_to_images.ts',
  ],
};
