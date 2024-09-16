import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_no_foreach';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-no-foreach', rule, {
  valid: [
    '({ forEach() {} }).forEach()',
    'declare const a: any; a.forEach()',
    '[][forEach]()',
    'for (const a of []) {}',
    '[].map(console.log)',
  ],
  invalid: [
    {
      code: `[].forEach()`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `[].forEach(console.log)`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `new Array().forEach(console.log)`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `declare const a: readonly unknown[]; a.forEach(console.log)`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `declare const a: unknown; if (Array.isArray(a)) a.forEach(console.log)`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `new Set().forEach(console.log)`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `declare const s: ReadonlySet<unknown>; s.forEach(console.log)`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `new Map().forEach(console.log)`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    // FIXME: This test fails because `m` has no type. It's unclear why this
    // doesn't work but `ReadonlySet` does.
    // {
    //   code: `declare const m: ReadonlyMap<unknown>; m.forEach(console.log)`,
    //   errors: [{ messageId: 'noForEach', line: 1 }],
    // },
    {
      // cannot transform when there's no value param
      code: `[].forEach(() => {})`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      // cannot transform when providing a context
      code: `[].forEach((e) => {}, this)`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      // cannot transform a non-statement forEach
      code: `const arr = [].forEach((e) => {})`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `[].forEach((e, i) => {})`,
      output: `for (const [i, e] of [].entries()) {}`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `new Set().forEach((e) => {})`,
      output: `for (const e of new Set()) {}`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `new Set().forEach((e, i) => {})`,
      output: `for (const [i, e] of new Set().entries()) {}`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `new Map().forEach((v) => {})`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `new Map().forEach((v, k) => {})`,
      output: `for (const [k, v] of new Map()) {}`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      // cannot transform when there's an array param
      code: `[].forEach((e, i, arr) => {})`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `[].forEach(({a, b}) => {})`,
      output: `for (const {a, b} of []) {}`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `[].forEach((e) => {})`,
      output: `for (const e of []) {}`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      code: `[].forEach((e) => [])`,
      output: `for (const e of []) []`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      // `return`s become `continue`s
      code: `
        [].forEach((e) => {
          return
        })
      `,
      output: `
        for (const e of []) {
          continue
        }
      `,
      errors: [{ messageId: 'noForEach', line: 2 }],
    },
    {
      // does not touch `return`s inside nested functions
      code: `
        [].forEach((e) => {
          function foo() {
            return
          }
        })
      `,
      output: `
        for (const e of []) {
          function foo() {
            return
          }
        }
      `,
      errors: [{ messageId: 'noForEach', line: 2 }],
    },
    {
      // handles parenthesized collections
      code: `([]).forEach((e) => {})`,
      output: `for (const e of ([])) {}`,
      errors: [{ messageId: 'noForEach', line: 1 }],
    },
    {
      // cannot transform when returning a value
      code: `
        [].forEach((e) => {
          return 1
        })
      `,
      errors: [{ messageId: 'noForEach', line: 2 }],
    },
    // FIXME: This test fails, but the same code works when run for real.
    // {
    //   code: `
    //     [].forEach((a) => {
    //       [].forEach((b) => {
    //         return
    //       })
    //       return
    //     })
    //   `,
    //   output: `
    //     for (const a of []) {
    //       for (const b of []) {
    //         continue
    //       }
    //       continue
    //     }
    //   `,
    //   errors: [
    //     { messageId: 'noForEach', line: 2 },
    //     { messageId: 'noForEach', line: 3 },
    //   ],
    // },
  ],
});
