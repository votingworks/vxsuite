import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { join } from 'path';
import rule from '../../src/rules/gts_no_dollar_sign_names';

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
});

ruleTester.run('gts-no-dollar-sign-names', rule, {
  valid: [
    { code: `abc` },
    { code: `'$abc'` },
    {
      code: `$0`,
      options: [{ allowedNames: ['$0'] }],
    },
  ],
  invalid: [
    {
      code: '$abc',
      errors: [{ messageId: 'noDollarSign', line: 1 }],
    },
    {
      code: '$abc()',
      errors: [{ messageId: 'noDollarSign', line: 1 }],
    },
    {
      // Do we ever want to specifically allow jQuery?
      code: `const $button = $('.button')`,
      errors: [
        { messageId: 'noDollarSign', line: 1 },
        { messageId: 'noDollarSign', line: 1 },
      ],
    },
    {
      // Do we ever want to specifically allow RxJS?
      code: 'device$.subscribe()',
      errors: [{ messageId: 'noDollarSign', line: 1 }],
    },
  ],
});
