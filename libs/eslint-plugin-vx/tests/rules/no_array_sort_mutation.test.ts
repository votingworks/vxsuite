import { join } from 'node:path';
import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import rule from '../../src/rules/no_array_sort_mutation';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
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
