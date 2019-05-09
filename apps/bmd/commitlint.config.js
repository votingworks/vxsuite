module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 50],
    'body-max-length': [2, 'always', 72],
    'subject-case': [2, 'always', ['sentence-case']],
    'subject-full-stop': [2, 'always', '.'],
  },
}
