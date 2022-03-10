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
    'order/properties-alphabetical-order': null,
    'selector-max-id': 1,
    'selector-max-universal': 1,
  },
}
