import { join } from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../../src/rules/no_array_sort_mutation';

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2018,
      tsconfigRootDir: join(__dirname, '../fixtures'),
      project: './tsconfig.json',
    },
  },
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
