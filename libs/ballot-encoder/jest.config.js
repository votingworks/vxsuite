const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  setupFilesAfterEnv: ['<rootDir>/test/expect.ts'],
}
