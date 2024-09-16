import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_parameter_properties';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
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
    {
      code: `
        class A {
          constructor(public a: number) {
            this.a = -a
          }
        }
      `,
    },
    {
      code: `
        class A {
          constructor([a]: number[]) {
            this.a = -a
          }
        }
      `,
    },
    {
      code: `
        class A {
          aMethod() {}
          [dynamicProperty] = null
          constructor()
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
    {
      code: `
        class A {
          a: number
          constructor(
            public a: number
          ) {
            this.a = a
          }
        }
      `,
      errors: [{ line: 7, messageId: 'noRedundantAssignment' }],
    },
  ],
});
