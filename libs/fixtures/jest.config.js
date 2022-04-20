const shared = require('../../jest.config.shared')

module.exports = {
  ...shared,
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/data/**/*',
  ],
};
