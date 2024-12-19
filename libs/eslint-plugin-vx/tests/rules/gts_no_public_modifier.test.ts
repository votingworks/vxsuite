import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_no_public_modifier';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-no-public-modifier', rule, {
  valid: [
    {
      code: `class A {}`,
    },
    {
      code: `class A { private a = 1 }`,
    },
    {
      code: `class A { protected a = 1 }`,
    },
    {
      code: `class A { constructor(public a = 1) {} }`,
    },
  ],
  invalid: [
    {
      code: `class A { public a = 1 }`,
      output: `class A { a = 1 }`,
      errors: [{ line: 1, messageId: 'noPublicModifier' }],
    },
    {
      code: `class A { public readonly a = 1 }`,
      output: `class A { readonly a = 1 }`,
      errors: [{ line: 1, messageId: 'noPublicModifier' }],
    },
    {
      code: `class A { public a() {} }`,
      output: `class A { a() {} }`,
      errors: [{ line: 1, messageId: 'noPublicModifier' }],
    },
    {
      code: `class A { public get a() {} }`,
      output: `class A { get a() {} }`,
      errors: [{ line: 1, messageId: 'noPublicModifier' }],
    },
    {
      code: `class A { public constructor(public a = 1) {} }`,
      output: `class A { constructor(public a = 1) {} }`,
      errors: [{ line: 1, messageId: 'noPublicModifier' }],
    },
    {
      code: `class A { constructor(public readonly a = 1) {} }`,
      output: `class A { constructor(readonly a = 1) {} }`,
      errors: [{ line: 1, messageId: 'noPublicModifier' }],
    },
  ],
});
