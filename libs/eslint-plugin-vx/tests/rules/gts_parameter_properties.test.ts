import { RuleTester } from '@typescript-eslint/rule-tester';
import { join } from 'node:path';
import rule from '../../src/rules/gts_parameter_properties.ts';

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2018,
      tsconfigRootDir: join(import.meta.dirname, '../fixtures'),
      project: './tsconfig.json',
    },
  },
});

ruleTester.run('gts-parameter-properties', rule, {
  valid: [
    {
      code: `
        class A {}
      `,
      options: [{ useParameterProperties: 'always' }],
    },
    {
      code: `
        class A {}
      `,
      options: [{ useParameterProperties: 'never' }],
    },
    {
      code: `
        class A {
          a: number
        }
      `,
      options: [{ useParameterProperties: 'always' }],
    },
    {
      code: `
        class A {
          a: number
        }
      `,
      options: [{ useParameterProperties: 'never' }],
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
      options: [{ useParameterProperties: 'always' }],
    },
    {
      code: `
        class A {
          constructor(public a: number) {
            this.a = -a
          }
        }
      `,
      options: [{ useParameterProperties: 'always' }],
    },
    {
      code: `
        class A {
          constructor([a]: number[]) {
            this.a = -a
          }
        }
      `,
      options: [{ useParameterProperties: 'always' }],
    },
    {
      code: `
        class A {
          aMethod() {}
          [dynamicProperty] = null
          constructor()
        }
      `,
      options: [{ useParameterProperties: 'always' }],
    },
    {
      code: `
        class A {
          a: number
          constructor(a: number) {
            this.a = a
          }
        }
      `,
      options: [{ useParameterProperties: 'never' }],
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
      options: [{ useParameterProperties: 'never' }],
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
      options: [{ useParameterProperties: 'never' }],
    },
    {
      code: `
        class A {
          constructor([a]: number[]) {}
        }
      `,
      options: [{ useParameterProperties: 'never' }],
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
          constructor(a: number) {
            this.a = a
          }
        }
      `,
      options: [{ useParameterProperties: 'always' }],
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
      options: [{ useParameterProperties: 'always' }],
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
      options: [{ useParameterProperties: 'always' }],
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
      options: [{ useParameterProperties: 'always' }],
      errors: [{ line: 7, messageId: 'noRedundantAssignment' }],
    },
    {
      code: `
        class A {
          constructor(public a: number) {
            this.a = -a
          }
        }
      `,
      options: [{ useParameterProperties: 'never' }],
      errors: [{ line: 3, messageId: 'doNotUseParameterProperties' }],
    },
    {
      code: `
        class A {
          constructor(private readonly a: number) {}
        }
      `,
      options: [{ useParameterProperties: 'never' }],
      errors: [{ line: 3, messageId: 'doNotUseParameterProperties' }],
    },
    {
      code: `
        class A {
          a: number
          constructor(
            public a: number,
            protected b: string,
            c: boolean
          ) {
            this.a = a
          }
        }
      `,
      options: [{ useParameterProperties: 'never' }],
      errors: [
        { line: 5, messageId: 'doNotUseParameterProperties' },
        { line: 6, messageId: 'doNotUseParameterProperties' },
      ],
    },
  ],
});
