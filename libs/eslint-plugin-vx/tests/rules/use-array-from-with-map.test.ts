import { ESLintUtils } from '@typescript-eslint/experimental-utils'
import { join } from 'path'
import rule from '../../src/rules/use-array-from-with-map'

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
})

ruleTester.run('use-array-from-with-map', rule, {
  valid: [
    {
      code: `const baz = Array.from(foo, bar)`,
    },
    {
      code: `const baz = [...foo]`,
    },
    {
      code: `const baz = [...foo].map`,
    },
    {
      code: `const baz = [...foo].map()`,
    },
    {
      code: `const baz = [...foo].map(bar, qux)`,
    },
    {
      code: `const baz = [...foo, bat].map(bar)`,
    },
    {
      code: `const baz = [].map(bar)`,
    },
    {
      code: `const baz = foo.map(bar)`,
    },
  ],
  invalid: [
    {
      code: `const baz = [...foo].map(bar)`,
      output: `const baz = Array.from(foo, bar)`,
      errors: [{ line: 1, messageId: 'useArrayFrom' }],
    },
    {
      code: `const baz = [...foo,].map(bar)`,
      output: `const baz = Array.from(foo, bar)`,
      errors: [{ line: 1, messageId: 'useArrayFrom' }],
    },
    {
      code: `
        const baz = [
          // a comment
          ...foo
        ].map(
          // another comment
          bar
        )
      `,
      output: `
        const baz = Array.from(
          // a comment
          foo
        , 
          // another comment
          bar
        )
      `,
      errors: [{ line: 2, messageId: 'useArrayFrom' }],
    },
    {
      code: `const baz = /*a*/[/*b*/.../*c*/foo/*d*/,]/*e*/./*f*/map/*g*/(/*h*/bar/*i*/)`,
      output: `const baz = /*a*/Array.from(/*b*//*c*/foo/*d*//*e*/, /*f*//*g*//*h*/bar/*i*/)`,
      errors: [{ line: 1, messageId: 'useArrayFrom' }],
    },
  ],
})
