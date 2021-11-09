const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  testEnvironment: 'jsdom',
  collectCoverageFrom: [ 
    ...shared.collectCoverageFrom,
    '!src/contest_tally.tsx',
    '!src/precinct_scanner_polls_report.tsx',
   ]
}
