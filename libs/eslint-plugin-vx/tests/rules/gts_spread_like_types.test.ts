import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_spread_like_types';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-spread-like-types', rule, {
  valid: [
    // arrays
    `[...[]]`,
    `[...new Set()]`,
    `[...(a ? [1] : [2])]`,
    `declare const a: unknown[]; [...a]`,

    // objects
    `({ ...{} })`,
    `({ ...(a ? { a } : {}) })`,
    `declare const a: {} & number; ({ ...a })`,
    `declare const a: object; ({ ...a })`,

    // calls
    `a(...[])`,

    // `any`
    `declare const a: any; [...a]`,

    // classes
    `new A(...[1])`,
  ],
  invalid: [
    // arrays
    {
      code: `declare const a: unknown; [...a]`,
      errors: [{ messageId: 'requireIterablesInArraySpread', line: 1 }],
    },
    {
      code: `[...1]`,
      errors: [{ messageId: 'requireIterablesInArraySpread', line: 1 }],
    },
    {
      code: `[...{}]`,
      errors: [{ messageId: 'requireIterablesInArraySpread', line: 1 }],
    },
    {
      code: `[...null]`,
      errors: [{ messageId: 'requireIterablesInArraySpread', line: 1 }],
    },
    {
      code: `[...undefined]`,
      errors: [{ messageId: 'requireIterablesInArraySpread', line: 1 }],
    },
    {
      code: `declare const a: unknown; [...(a ? [a] : a)]`,
      errors: [{ messageId: 'requireIterablesInArraySpread', line: 1 }],
    },

    // objects
    {
      code: `({ ...[] })`,
      errors: [{ messageId: 'requireObjectsInObjectSpread', line: 1 }],
    },
    {
      code: `declare const a: unknown[]; ({ ...a })`,
      errors: [{ messageId: 'requireObjectsInObjectSpread', line: 1 }],
    },
    {
      code: `declare const a: readonly unknown[]; ({ ...a })`,
      errors: [{ messageId: 'requireObjectsInObjectSpread', line: 1 }],
    },
    {
      code: `({ ...new Set() })`,
      errors: [{ messageId: 'requireObjectsInObjectSpread', line: 1 }],
    },
    {
      code: `({ ...null })`,
      errors: [{ messageId: 'requireObjectsInObjectSpread', line: 1 }],
    },
    {
      code: `({ ...undefined })`,
      errors: [{ messageId: 'requireObjectsInObjectSpread', line: 1 }],
    },

    // calls
    {
      code: `a(...1)`,
      errors: [{ messageId: 'requireIterablesInCallSpread', line: 1 }],
    },
  ],
});
