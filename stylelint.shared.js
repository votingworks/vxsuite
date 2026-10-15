// Configuration for our CSS linting with stylelint
module.exports = {
  extends: ['stylelint-config-standard'],
  customSyntax: 'postcss-styled-syntax',
  rules: {
    // `rgba` matches the legacy notation below, and the autofix rewrites JS
    // calls like polished's `rgba()` inside interpolations.
    'color-function-alias-notation': null,
    // We use color functions (e.g. rgb) in nested JS that, being JS, need comma-separated
    // parameters. "Modern" notation in CSS is space-separated parameters. "Legacy"
    // notation enforces comma-separated parameters.
    'color-function-notation': 'legacy',
    // Usually this rule is smart enough to ignore nested JS variable names, but
    // sometimes it de-capitalizes them, so it's unsafe for auto-fix.
    'value-keyword-case': [
      'lower',
      {
        disableFix: true,
        camelCaseSvgKeywords: true,
      },
    ],
    // Modern "context" notation for media queries is:
    //         @media (width >= 600px)
    // Chromium supports this only after version 104, so we enforce the older
    // "prefix" notation:
    //         @media (min-width: 600px)
    'media-feature-range-notation': 'prefix',
    // Styled components often use an empty template literal, e.g. with `.attrs()`.
    'no-empty-source': null,
  },
};
