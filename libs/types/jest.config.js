const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  collectCoverageFrom: ['src/**/*.ts', '!src/api/module-scan.ts'],
}
