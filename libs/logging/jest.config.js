const shared = require('../../jest.config.shared');

module.exports = {
  ...shared,
  testEnvironment: 'jsdom',
};
