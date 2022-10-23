const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 40,
      functions: 55,
      lines: 70,
    },
  },
  testEnvironment: "jsdom"
};
