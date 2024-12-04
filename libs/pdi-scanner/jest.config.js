const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  collectCoverageFrom: [
    ...shared.collectCoverageFrom,
    '!src/ts/index.ts',
    '!src/ts/demo.ts',
  ],
  coverageProvider: 'babel',
  coverageThreshold: {
    global: {
      branches: 100,
      lines: 100,
    },
  },
};
