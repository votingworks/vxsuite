import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { join } from 'path';
import rule from '../../src/rules/gts_identifiers';

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
});

ruleTester.run('gts-identifiers', rule, {
  valid: [
    { code: `abc` },
    { code: `'$abc'` },
    {
      code: `$0`,
      options: [{ allowedNames: ['$0'] }],
    },
    { code: `const abc = 12` },
    { code: `const a_b_c = 12` },
    { code: `function ab_() {}` },
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
    {
      code: 'const illegalnÀme = 12',
      errors: [{ messageId: 'identifiersAllowedCharacters', line: 1 }],
    },
  ],
});
