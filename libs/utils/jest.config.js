const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  collectCoverageFrom: [
    ...shared.collectCoverageFrom,
    // TODO: remove these by bringing their coverage to 100% (https://github.com/votingworks/vxsuite/issues/995)
    '!src/cardTallies.ts',
    '!src/iterators.ts',
    '!src/tallies.ts',
    '!src/types.ts',
    '!src/votes.ts',
    '!src/Card/MemoryCard.ts',
    '!src/Printer/utils.ts',
    '!src/Storage/index.ts',
   ]
}
