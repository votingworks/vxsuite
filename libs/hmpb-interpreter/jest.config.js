const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  collectCoverageFrom: [...shared.collectCoverageFrom, '!test/fixtures/**/*'],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 81,
      functions: 90,
      lines: 90,
    },
  },
}
