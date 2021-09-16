const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  testEnvironment: 'jsdom',
  collectCoverageFrom: [ 
    ...shared.collectCoverageFrom,
    '!src/ContestTally.tsx',
    '!src/LogoMark.tsx',
    '!src/NumberPad.tsx',
    '!src/PrecinctScannerPollsReport.tsx',
    '!src/PrecinctScannerTallyReport.tsx',
    '!src/TallyReport.tsx',
   ]
}
