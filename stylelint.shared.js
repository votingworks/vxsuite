module.exports = {
  extends: ['stylelint-config-standard'],
  customSyntax: 'postcss-styled-syntax',
  rules: {
    'color-function-notation': 'legacy',
    'value-keyword-case': [
      'lower',
      {
        disableFix: true,
        camelCaseSvgKeywords: true,
      },
    ],
  },
};
