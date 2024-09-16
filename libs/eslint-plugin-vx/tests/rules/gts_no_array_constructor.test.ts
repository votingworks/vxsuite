import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_no_array_constructor';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-no-array-constructor', rule, {
  valid: [
    {
      code: `[]`,
    },
    {
      code: `[1]`,
    },
    {
      code: `Array.from(a)`,
    },
    {
      code: `Array.from({ length: 1 })`,
    },
    {
      code: `Array.of(1)`,
    },
    {
      code: `Array.of(a)`,
    },
    {
      code: `Array?.()`,
    },
  ],
  invalid: [
    {
      code: `Array()`,
      output: `[]`,
      errors: [{ line: 1, messageId: 'noArrayConstructor' }],
    },
    {
      code: `Array/*a*/(/*b*/)/*c*/`,
      output: `/*a*/[/*b*/]/*c*/`,
      errors: [{ line: 1, messageId: 'noArrayConstructor' }],
    },
    {
      code: `Array<number>()`,
      output: `Array.of<number>()`,
      errors: [{ line: 1, messageId: 'noArrayConstructor' }],
    },
    {
      code: `Array/*a*/<number>/*b*/(/*c*/)/*d*/`,
      output: `Array.of/*a*/<number>/*b*/(/*c*/)/*d*/`,
      errors: [{ line: 1, messageId: 'noArrayConstructor' }],
    },
    {
      code: `new Array()`,
      output: `[]`,
      errors: [{ line: 1, messageId: 'noArrayConstructor' }],
    },
    {
      code: `new/*a*/Array/*b*/(/*c*/)/*d*/`,
      output: `/*a*//*b*/[/*c*/]/*d*/`,
      errors: [{ line: 1, messageId: 'noArrayConstructor' }],
    },
    {
      code: `Array(1)`,
      output: `Array.from({ length: 1 })`,
      errors: [{ line: 1, messageId: 'noArrayConstructor' }],
    },
    {
      code: `new Array(1)`,
      output: `Array.from({ length: 1 })`,
      errors: [{ line: 1, messageId: 'noArrayConstructor' }],
    },
    {
      code: `Array(1, 2)`,
      output: `[1, 2]`,
      errors: [{ line: 1, messageId: 'noArrayConstructor' }],
    },
    {
      code: `new Array(1, 2)`,
      output: `[1, 2]`,
      errors: [{ line: 1, messageId: 'noArrayConstructor' }],
    },
    {
      code: `new Array<1 | 2>(1, 2)`,
      output: `Array.of<1 | 2>(1, 2)`,
      errors: [{ line: 1, messageId: 'noArrayConstructor' }],
    },
  ],
});
