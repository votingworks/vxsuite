const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      statements: 38,
      branches: 33,
      functions: 33,
      lines: 41,
    },
  },
}
