import { RuleTester } from '@typescript-eslint/rule-tester';
import { join } from 'node:path';
import rule from '../../src/rules/gts_no_private_fields';

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2018,
      tsconfigRootDir: join(__dirname, '../fixtures'),
      project: './tsconfig.json',
    },
  },
});

ruleTester.run('gts-no-private-fields', rule, {
  valid: [
    {
      code: `class A {}`,
    },
    {
      code: `class A { a = 1 }`,
    },
    {
      code: `class A { a() {} }`,
    },
    {
      code: `class A { private a = 1 }`,
    },
  ],
  invalid: [
    {
      code: `class A { #a = 1 }`,
      errors: [{ line: 1, messageId: 'noPrivateFields' }],
    },
    {
      code: `class A { #a() {} }`,
      errors: [{ line: 1, messageId: 'noPrivateFields' }],
    },
    {
      code: `class A { a() { this.#a = 1 } }`,
      errors: [{ line: 1, messageId: 'noPrivateFields' }],
    },
  ],
});
