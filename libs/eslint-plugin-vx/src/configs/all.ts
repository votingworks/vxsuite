export = {
  extends: ['./configs/base'],
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    'no-void': 'off', // allow silencing `no-floating-promises` with `void`
    'vx/no-floating-results': 'error',
  },
}
