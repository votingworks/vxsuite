import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_object_literal_types';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-object-literal-types', rule, {
  valid: [
    `let a;`,
    `const a: A = {}`,
    `const a = 1 as number`,
    `const a = {} as unknown as A`,
    `const a = {} as const`,
    `
      const foo: Foo = {
        a: 123,
        b: 'abc',
      };
    `,
    `
      const foo = {
        a: 123,
        b: 'abc',
      } as const;
    `,
  ],
  invalid: [
    {
      code: `const a = {} as A`,
      errors: [
        {
          messageId: 'noObjectLiteralTypeAssertions',
          line: 1,
          suggestions: [
            {
              messageId: 'convertToTypeAnnotation',
              output: `const a: A = {}`,
            },
            {
              messageId: 'useTypedAs',
              output: `const a = typedAs<A>({})`,
            },
            {
              messageId: 'removeTypeAssertion',
              output: `const a = {}`,
            },
            {
              messageId: 'castToUnknownFirst',
              output: `const a = {} as unknown as A`,
            },
          ],
        },
      ],
    },
    {
      code: `const a: A = {} as B`,
      errors: [
        {
          messageId: 'noObjectLiteralTypeAssertions',
          line: 1,
          suggestions: [
            {
              messageId: 'useTypedAs',
              output: `const a: A = typedAs<B>({})`,
            },
            {
              messageId: 'removeTypeAssertion',
              output: `const a: A = {}`,
            },
            {
              messageId: 'castToUnknownFirst',
              output: `const a: A = {} as unknown as B`,
            },
          ],
        },
      ],
    },
    {
      code: `
        function func() {
          return {
            bar: 123,
            bam: 'abc',
          } as Foo;
        }
      `,
      errors: [
        {
          messageId: 'noObjectLiteralTypeAssertions',
          line: 3,
          suggestions: [
            {
              messageId: 'useTypedAs',
              output: `
        function func() {
          return typedAs<Foo>({
            bar: 123,
            bam: 'abc',
          });
        }
      `,
            },
            {
              messageId: 'removeTypeAssertion',
              output: `
        function func() {
          return {
            bar: 123,
            bam: 'abc',
          };
        }
      `,
            },
            {
              messageId: 'castToUnknownFirst',
              output: `
        function func() {
          return {
            bar: 123,
            bam: 'abc',
          } as unknown as Foo;
        }
      `,
            },
          ],
        },
      ],
    },
    {
      code: `
        const badFoo = {
          a: 123,
          b: 'abc',
        };
      `,
      errors: [{ messageId: 'useTypeAnnotation', line: 2 }],
    },
    {
      code: `
        const badFoo = {
          a: 123,
          b: 'abc',
        } as Foo;
      `,
      errors: [{ messageId: 'noObjectLiteralTypeAssertions', line: 2 }],
    },
  ],
});
