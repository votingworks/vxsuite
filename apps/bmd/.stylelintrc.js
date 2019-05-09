module.exports = {
  processors: ['stylelint-processor-styled-components'],
  extends: [
    'stylelint-config-palantir',
    'stylelint-config-prettier',
    'stylelint-config-styled-components',
  ],
  rules: {
    'selector-max-id': 1,
  },
}
