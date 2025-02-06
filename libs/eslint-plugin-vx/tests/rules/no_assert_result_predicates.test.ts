import { join } from 'node:path';
import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import rule from '../../src/rules/no_assert_result_predicates';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('no-assert-result-predicates', rule, {
  valid: [
    'assert(true);',
    'assert(false);',
    'result.isOk();',
    'result.isErr();',
  ],
  invalid: [
    {
      code: 'assert(result.isOk());',
      errors: [{ line: 1, messageId: 'noAssertResultPredicates' }],
    },
    {
      code: 'assert(result.isErr());',
      errors: [{ line: 1, messageId: 'noAssertResultPredicates' }],
    },
    {
      code: 'assert(!result.isOk());',
      errors: [{ line: 1, messageId: 'noAssertResultPredicates' }],
    },
    {
      code: 'assert(!result.isErr());',
      errors: [{ line: 1, messageId: 'noAssertResultPredicates' }],
    },
    {
      code: 'assert.ok(result.isOk());',
      errors: [{ line: 1, messageId: 'noAssertResultPredicates' }],
    },
    {
      code: 'assert.ok(result.isErr());',
      errors: [{ line: 1, messageId: 'noAssertResultPredicates' }],
    },
    {
      code: 'assert.ok(!result.isOk());',
      errors: [{ line: 1, messageId: 'noAssertResultPredicates' }],
    },
    {
      code: 'assert.ok(!result.isErr());',
      errors: [{ line: 1, messageId: 'noAssertResultPredicates' }],
    },
    {
      code: 'expect(result.isOk()).toBe(true);',
      errors: [{ line: 1, messageId: 'noExpectResultPredicates' }],
    },
    {
      code: 'expect(result.isErr()).toBe(true);',
      errors: [{ line: 1, messageId: 'noExpectResultPredicates' }],
    },
    {
      code: 'expect(!result.isOk()).toBe(true);',
      errors: [{ line: 1, messageId: 'noExpectResultPredicates' }],
    },
    {
      code: 'expect(!result.isErr()).toBe(true);',
      errors: [{ line: 1, messageId: 'noExpectResultPredicates' }],
    },
    {
      code: 'expect(result.isOk()).toEqual(true);',
      errors: [{ line: 1, messageId: 'noExpectResultPredicates' }],
    },
    {
      code: 'expect(result.isErr()).toEqual(true);',
      errors: [{ line: 1, messageId: 'noExpectResultPredicates' }],
    },
    {
      code: 'expect(!result.isOk()).toEqual(true);',
      errors: [{ line: 1, messageId: 'noExpectResultPredicates' }],
    },
    {
      code: 'expect(!result.isErr()).toEqual(true);',
      errors: [{ line: 1, messageId: 'noExpectResultPredicates' }],
    },
  ],
});
