import { ESLintUtils } from '@typescript-eslint/experimental-utils'
import { join } from 'path'
import rule from '../../src/rules/object-shorthand-grouping'

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
})

ruleTester.run('object-shorthand-grouping', rule, {
  valid: [
    {
      code: `({})`,
    },
    {
      code: `({ a })`,
    },
    {
      code: `({ a: 1 })`,
    },
    {
      code: `({ a, b: 1 })`,
    },
    {
      code: `({ a: 1, b: 2 })`,
    },
    {
      code: `({ ...props, a, b: 1 })`,
    },
  ],
  invalid: [
    {
      code: `({ a: 1, b })`,
      errors: [{ line: 1, messageId: 'groupProperty' }],
    },
    {
      code: `({ a, b: 1, c })`,
      errors: [{ line: 1, messageId: 'groupProperty' }],
    },
    {
      code: `({ a() {}, b })`,
      errors: [{ line: 1, messageId: 'groupProperty' }],
    },
  ],
})
