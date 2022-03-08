const shared = require('../../jest.config.shared');

module.exports = {
  ...shared,
  collectCoverageFrom: [...shared.collectCoverageFrom, '!test/fixtures/**/*'],
  coverageThreshold: {
    global: {
      statements: 94,
      branches: 83,
      functions: 91,
      lines: 94,
    },
  },
};
