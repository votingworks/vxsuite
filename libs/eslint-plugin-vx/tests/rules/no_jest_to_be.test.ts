import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/no_jest_to_be';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('no-jest-to-be', rule, {
  valid: [
    {
      code: `expect(num).toEqual(5)`,
    },
    {
      code: `expect(obj).toEqual({ a: 5 })`,
    },
    {
      code: `toEqual(5)`,
    },
    {
      code: `expect(predicate).toBeTruthy()`,
    },
    {
      code: `expect(predicate)`,
    },
  ],
  invalid: [
    {
      code: `expect(num).toBe(5)`,
      output: `expect(num).toEqual(5)`,
      errors: [{ messageId: 'noJestToBe', line: 1 }],
    },
    {
      code: `expect(num).toBe({ a: 5 })`,
      output: `expect(num).toEqual({ a: 5 })`,
      errors: [{ messageId: 'noJestToBe', line: 1 }],
    },
  ],
});
