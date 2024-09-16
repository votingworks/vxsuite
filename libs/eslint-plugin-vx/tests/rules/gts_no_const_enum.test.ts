import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_no_const_enum';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
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
