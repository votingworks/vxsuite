import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { join } from 'path';
import rule from '../../src/rules/gts-parameter-properties';

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
});

ruleTester.run('gts-parameter-properties', rule, {
  valid: [
    {
      code: `
        class A {}
      `,
    },
    {
      code: `
        class A {
          a: number
        }
      `,
    },
    {
      code: `
        class A {
          a: number
          constructor(a: number) {
            this.a = -a
          }
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        class A {
          a: number
          constructor(a: number) {
            this.a = a
          }
        }
      `,
      errors: [{ line: 4, messageId: 'useParameterProperties' }],
    },
    {
      code: `
        class A {
          a: number
          b: number
          constructor(a: number) {
            this.a = a
            this.b = a + 1
          }
        }
      `,
      errors: [{ line: 5, messageId: 'useParameterProperties' }],
    },
    {
      code: `
        class A {
          a: number
          b: number
          constructor(
            a: number,
            b: number
          ) {
            this.a = a
            this.b = b
          }
        }
      `,
      errors: [
        { line: 6, messageId: 'useParameterProperties' },
        { line: 7, messageId: 'useParameterProperties' },
      ],
    },
  ],
});
