import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_array_type_style';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

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
    'const t: Array<string[]>',
    'const s: ArrayLike<string>',
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
    {
      code: 'type A<T> = Array<T>',
      errors: [{ messageId: 'useShortArrayType', line: 1 }],
      output: 'type A<T> = T[]',
    },
    {
      code: 'const f = (a: Array<T>) => a',
      errors: [{ messageId: 'useShortArrayType', line: 1 }],
      output: 'const f = (a: T[]) => a',
    },
    {
      code: 'const f = (a: T<string>[]) => a',
      errors: [{ messageId: 'useLongArrayType', line: 1 }],
      output: 'const f = (a: Array<T<string>>) => a',
    },
    {
      code: 'type AR<T> = ReadonlyArray<T>',
      errors: [{ messageId: 'useShortArrayType', line: 1 }],
      output: 'type AR<T> = readonly T[]',
    },
    {
      code: 'const m: Array<Array<string>>',
      errors: [{ messageId: 'useShortArrayType', line: 1 }],
      output: 'const m: Array<string[]>',
    },
    // FIXME: In these tests, the fixer output only transforms one array type,
    // not the nested one. This is possibly due to overlap in the fix ranges.
    // When run using eslint against real files, it works correctly.
    {
      code: 'const k: T<string>[][]',
      errors: [
        { messageId: 'useLongArrayType', line: 1 },
        { messageId: 'useLongArrayType', line: 1 },
      ],
      output: 'const k: Array<T<string>>[]',
      // output: 'const k: Array<Array<T<string>>>',
    },
    {
      code: 'const l: Array<string>[]',
      errors: [
        { messageId: 'useLongArrayType', line: 1 },
        { messageId: 'useShortArrayType', line: 1 },
      ],
      output: 'const l: string[][]',
      // output: 'const l: Array<string[]>',
    },
  ],
});
