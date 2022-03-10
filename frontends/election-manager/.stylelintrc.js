// Ensure we use all available babel parser plugins, but not the type annotation
// ones since stylelint handles that itself.
const { buildOptions } = require('@codemod/parser');

// Config for stylelint parsing CSS in Styled Components
// Note the `--fix` flag doesn't yet work for CSS-in-JS
module.exports = {
  processors: [],
  extends: [
    'stylelint-config-palantir',
    'stylelint-config-prettier',
    'stylelint-config-styled-components',
  ],
  rules: {
    'selector-max-id': 1,
    'selector-max-universal': 1,
  },
};
