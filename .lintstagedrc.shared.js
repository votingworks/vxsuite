// @ts-check

const base = {
  '*.+(js|jsx|ts|tsx|css|graphql|json|less|md|mdx|sass|scss|yaml|yml)': [
    'prettier --write',
  ],
  '*.+(js|jsx|ts|tsx)': ['eslint --quiet --fix'],
  'package.json': ['sort-package-json'],
};

const frontend = {
  ...base,
  '*.+(js|jsx|ts|tsx)': ['stylelint --quiet --fix', 'eslint --quiet --fix'],
  '*.css': ['stylelint --config .stylelintrc-css.js --fix'],
};

module.exports = {
  base,
  frontend,
};
