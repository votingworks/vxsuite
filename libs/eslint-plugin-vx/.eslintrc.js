const { AST_NODE_TYPES } = require('@typescript-eslint/utils');

module.exports = {
  extends: [require.resolve('./build/configs/recommended')],
  rules: {
    'vx/gts-identifiers': [
      'error',
      { allowedNames: Object.keys(AST_NODE_TYPES) },
    ],
    'vx/gts-jsdoc': 'off',
    'vx/gts-no-default-exports': 'off',
  },
};