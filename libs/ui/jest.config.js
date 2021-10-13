const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  testEnvironment: 'jsdom',
  collectCoverageFrom: [ 
    ...shared.collectCoverageFrom,
    '!src/ContestTally.tsx',
    '!src/PrecinctScannerPollsReport.tsx',
    '!src/PrecinctScannerTallyReport.tsx',
   ]
}
