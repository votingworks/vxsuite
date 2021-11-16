const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  collectCoverageFrom: ['src/**/*.ts', '!src/api/services/scan/index.ts.ts'],
}
