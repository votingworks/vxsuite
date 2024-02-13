const shared = require('../../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      branches: -16,
      lines: -38,
    },
  },
  coveragePathIgnorePatterns: ['src/index.ts', 'src/generate_fixtures.ts'],
};
