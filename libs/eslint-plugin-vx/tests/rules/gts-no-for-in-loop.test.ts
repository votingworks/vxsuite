import { ESLintUtils } from '@typescript-eslint/experimental-utils'
import { join } from 'path'
import rule from '../../src/rules/gts-no-for-in-loop'

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
})

ruleTester.run('gts-no-for-in-loop', rule, {
  valid: [
    // { code: 'for (const k of Object.keys({})) {}' },
    // { code: 'for (const [k, v] of Object.entries({})) {}' },
  ],
  invalid: [
    // {
    //   code: 'for (const k in {}) {}',
    //   output: 'for (const k of Object.keys({})) {}',
    //   errors: [{ messageId: 'noForInLoop', line: 1 }],
    // },
    // {
    //   code: `
    //     for (const k in o) {
    //       if (Object.prototype.hasOwnProperty.call(o, k)) {
    //         o[k] = 1
    //       }
    //     }
    //   `,
    //   output: `
    //     for (const k of Object.keys(o)) {
    //       o[k] = 1
    //     }
    //   `,
    //   errors: [{ messageId: 'noForInLoop', line: 2 }],
    // },
    // {
    //   code: `
    //     for (const k in o) {
    //       if (!Object.prototype.hasOwnProperty.call(o, k))
    //         continue
    //       o[k] = 1
    //     }
    //   `,
    //   output: `
    //     for (const k of Object.keys(o)) {
    //       o[k] = 1
    //     }
    //   `,
    //   errors: [{ messageId: 'noForInLoop', line: 2 }],
    // },
    {
      code: `
        for (const k in o) {
          if (o.hasOwnProperty(k)) {
            o[k] = 1
          }
        }
      `,
      output: `
        for (const k of Object.keys(o)) {
          o[k] = 1
        }
      `,
      errors: [{ messageId: 'noForInLoop', line: 2 }],
    },
    // {
    //   code: `
    //     for (const k in o) {
    //       if (!o.hasOwnProperty(k))
    //         continue
    //       o[k] = 1
    //     }
    //   `,
    //   output: `
    //     for (const k of Object.keys(o)) {
    //       o[k] = 1
    //     }
    //   `,
    //   errors: [{ messageId: 'noForInLoop', line: 2 }],
    // },
  ],
})
