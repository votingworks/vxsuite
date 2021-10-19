import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { join } from 'path';
import rule from '../../src/rules/no-array-sort-mutation';

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
});

ruleTester.run('no-array-sort-mutation', rule, {
  valid: [`[].sort()`, `[...array].sort()`, `array.slice().sort()`],
  invalid: [
    {
      code: `array.sort()`,
      errors: [{ line: 1, messageId: 'badSort' }],
    },
    {
      code: `obj.prop.sort()`,
      errors: [{ line: 1, messageId: 'badSort' }],
    },
    {
      code: `array.sort((a, b) => b - a)`,
      errors: [{ line: 1, messageId: 'badSort' }],
    },
  ],
});
