const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  collectCoverageFrom: [
    ...shared.collectCoverageFrom,
    '!src/**/index.ts',
    '!src/cli/**/*.ts',
    '!src/mocks/**/*.ts',
    '!src/types/**/*.ts',
  ],
  coverageProvider: 'babel',
};
