const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coveragePathIgnorePatterns: [
    'src/index.ts',
    'src/legacy/.*.ts',
    'src/memory_card.ts',
    'src/test_utils.ts',
    'test/utils.ts,',
  ],
  coverageThreshold: {
    global: {
      statements: 51,
      branches: 39,
      functions: 60,
      lines: 51,
    },
  },
};
