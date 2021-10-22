import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { join } from 'path';
import rule from '../../src/rules/gts-no-object-literal-type-assertions';

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
});

ruleTester.run('gts-no-object-literal-type-assertions', rule, {
  valid: [
    `const a: A = {}`,
    `const a = 1 as number`,
    `const a = {} as unknown as A`,
    `const a = {} as const`,
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
  ],
});
