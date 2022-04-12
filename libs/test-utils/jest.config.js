const shared = require('../../jest.config.shared');

module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      statements: 52,
      branches: 45,
      functions: 58,
      lines: 54,
    },
  },
};
