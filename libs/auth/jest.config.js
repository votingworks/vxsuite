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
      statements: 50,
      branches: 35,
      functions: 55,
      lines: 50,
    },
  },
};
