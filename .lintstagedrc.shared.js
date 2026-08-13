// @ts-check

const base = {
  '*.+(js|cjs|mjs|jsx|ts|tsx|css|graphql|json|less|md|mdx|sass|scss|yaml|yml)':
    ['prettier --write'],
  '*.+(js|jsx|ts|tsx)': ['eslint --cache --quiet --fix'],
  // skip_children keeps rustfmt from recursively formatting a staged file's
  // out-of-line child modules, which may not be staged. The parser edition
  // comes from the root rustfmt.toml.
  '*.rs': ['rustfmt --config skip_children=true'],
  'package.json': ['sort-package-json'],
};

const frontend = {
  ...base,
  '*.+(js|jsx|ts|tsx)': [
    'stylelint --quiet --fix',
    'eslint --cache --quiet --fix',
  ],
  '*.css': ['stylelint --config .stylelintrc-css.js --fix'],
};

module.exports = {
  base,
  frontend,
};
