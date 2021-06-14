const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  collectCoverageFrom: [...shared.collectCoverageFrom, '!test/fixtures/**/*'],
  coverageThreshold: {
    global: {
      statements: 94,
      branches: 85,
      functions: 92,
      lines: 94,
    },
  },
}
