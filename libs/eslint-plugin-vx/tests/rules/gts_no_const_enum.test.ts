import { RuleTester } from '@typescript-eslint/rule-tester';
import { join } from 'node:path';
import rule from '../../src/rules/gts_no_const_enum';

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2018,
      tsconfigRootDir: join(__dirname, '../fixtures'),
      project: './tsconfig.json',
    },
  },
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
