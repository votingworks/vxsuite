const shared = require('../../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    /* Experimental package, don't enforce coverage yet */
    global: {
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0,
    },
  },
  setupFiles: ['react-app-polyfill/jsdom'],
  testEnvironment: 'jsdom',
};
