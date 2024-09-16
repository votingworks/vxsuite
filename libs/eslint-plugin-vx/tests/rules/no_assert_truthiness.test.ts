import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/no_assert_truthiness';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('no-assert-truthiness', rule, {
  valid: [
    {
      code: `console.assert({})`,
    },
    {
      code: `setTimeout(resolve, 0)`,
    },
    {
      code: `assert()`,
    },
    {
      code: `assert({})`,
    },
    {
      code: `ok({})`,
    },
    {
      code: `assert({}, 'message')`,
    },
    {
      code: `assert(true, 'message')`,
    },
    {
      code: `assert(typeof 'a' !== 'undefined', 'message')`,
    },
    {
      code: `declare const a: object | undefined; assert(a, 'message')`,
    },
  ],
  invalid: [
    {
      code: `assert(0)`,
      errors: [{ line: 1, messageId: 'assertStringOrNumber' }],
    },
    {
      code: `assert(0, 'zero')`,
      errors: [{ line: 1, messageId: 'assertStringOrNumber' }],
    },
    {
      code: `assert(1)`,
      errors: [{ line: 1, messageId: 'assertStringOrNumber' }],
    },
    {
      code: `assert('')`,
      errors: [{ line: 1, messageId: 'assertStringOrNumber' }],
    },
    {
      code: `assert('abc')`,
      errors: [{ line: 1, messageId: 'assertStringOrNumber' }],
    },
    {
      code: `declare const a: string; assert(a)`,
      errors: [{ line: 1, messageId: 'assertStringOrNumber' }],
    },
    {
      code: `declare const a: string | undefined; assert(a)`,
      errors: [{ line: 1, messageId: 'assertStringOrNumber' }],
    },
    {
      code: `declare const a: object; assert(a)`,
      options: [{ objects: true, asserts: ['assert'] }],
      errors: [{ line: 1, messageId: 'assertObject' }],
    },
    {
      code: `
        type Optional<T> = T | undefined
        declare const a: Optional<object>
        assert(a)
      `,
      options: [{ objects: true, asserts: ['assert'] }],
      output: `
        type Optional<T> = T | undefined
        declare const a: Optional<object>
        assert(typeof a !== 'undefined')
      `,
      errors: [{ line: 4, messageId: 'assertObject' }],
    },
    {
      code: `declare const a: number | undefined; assert(a)`,
      errors: [{ line: 1, messageId: 'assertStringOrNumber' }],
    },
    {
      code: `declare const a: number | string | undefined; assert(a)`,
      errors: [{ line: 1, messageId: 'assertStringOrNumber' }],
    },
    {
      code: `declare const a: 'abc'; assert(a)`,
      errors: [{ line: 1, messageId: 'assertStringOrNumber' }],
    },
    {
      code: `declare const a: 0; assert(a)`,
      errors: [{ line: 1, messageId: 'assertStringOrNumber' }],
    },
    {
      code: `declare const a: object | undefined; assert(a, 'message')`,
      options: [{ objects: true, asserts: ['assert'] }],
      output: `declare const a: object | undefined; assert(typeof a !== 'undefined', 'message')`,
      errors: [{ line: 1, messageId: 'assertObject' }],
    },
  ],
});
