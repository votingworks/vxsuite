const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  collectCoverageFrom: [
    ...shared.collectCoverageFrom,
    // TODO: remove these by bringing their coverage to 100% (https://github.com/votingworks/vxsuite/issues/995)
    '!src/cardTallies.ts',
    '!src/tallies.ts',
    '!src/votes.ts',
   ]
}
