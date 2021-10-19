import { ESLintUtils } from '@typescript-eslint/experimental-utils'
import { join } from 'path'
import rule from '../../src/rules/gts-array-type-style'

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
})

ruleTester.run('gts-array-type-style', rule, {
  valid: [
    'const a: string[]',
    'const b: readonly string[]',
    'const c: ns.MyObj[]',
    'const d: Array<string|number>',
    'const e: ReadonlyArray<string|number>',
    'const z: Array',
    'const y: ReadonlyArray',
    'const x: []',
    'const v: any[]',
    'const u: unknown[]',
  ],
  invalid: [
    {
      code: 'const f: Array<string>',
      errors: [{ messageId: 'useShortArrayType', line: 1 }],
      output: 'const f: string[]',
    },
    {
      code: 'const g: ReadonlyArray<string>',
      errors: [{ messageId: 'useShortArrayType', line: 1 }],
      output: 'const g: readonly string[]',
    },
    {
      code: 'const h: {n: number, s: string}[]',
      errors: [{ messageId: 'useLongArrayType', line: 1 }],
      output: 'const h: Array<{n: number, s: string}>',
    },
    {
      code: 'const i: (string|number)[]',
      errors: [{ messageId: 'useLongArrayType', line: 1 }],
      output: 'const i: Array<(string|number)>',
    },
    {
      code: 'const j: readonly (string|number)[]',
      errors: [{ messageId: 'useLongArrayType', line: 1 }],
      output: 'const j: ReadonlyArray<(string|number)>',
    },
  ],
})
