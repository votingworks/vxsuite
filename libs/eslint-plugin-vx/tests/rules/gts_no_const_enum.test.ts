import { ESLintUtils } from '@typescript-eslint/utils';
import { join } from 'path';
import rule from '../../src/rules/gts_no_const_enum';

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
});

ruleTester.run('gts-no-const-enum', rule, {
  valid: [`enum A {};`],
  invalid: [
    {
      code: `const enum A {};`,
      errors: [{ messageId: 'noConstEnum', line: 1 }],
      output: `enum A {};`,
    },
  ],
});
