// Skips eslint (unlike the shared base config) because this package's
// .eslintrc.js loads itself as a plugin via its own build output, which
// eslint can't resolve when run by lint-staged.
module.exports = {
  '*.+(js|jsx|ts|tsx|css|graphql|json|less|md|mdx|sass|scss|yaml|yml)': [
    'prettier --write',
  ],
  'package.json': ['sort-package-json'],
};
