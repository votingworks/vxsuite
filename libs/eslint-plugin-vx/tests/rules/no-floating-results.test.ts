import { ESLintUtils } from '@typescript-eslint/experimental-utils'
import rule from '../../src/rules/no-floating-results'
import { join } from 'path'

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
})

ruleTester.run('no-floating-results', rule, {
  valid: [
    `
import { ok } from '@votingworks/types'
ok().unsafeUnwrap()
    `,
    `
import { ok } from '@votingworks/types'
ok().unsafeUnwrapErr()
    `,
    `
import { ok } from '@votingworks/types'
ok().ok()
    `,
    `
import { ok } from '@votingworks/types'
ok().err()
    `,
    `
import { ok, Result } from '@votingworks/types'
let result: Result<void, void>
if (true) {
  result = ok()
} else {
  result = ok()
}
    `,
    {
      options: [{ ignoreVoid: true }],
      code: `
import { ok } from '@votingworks/types'
void ok()
      `,
    },
  ],
  invalid: [
    {
      code: `
import { ok } from '@votingworks/types'
ok()
    `,
      errors: [{ line: 3, messageId: 'floatingVoid' }],
    },
    {
      code: `
import { err } from '@votingworks/types'
err()
    `,
      errors: [{ line: 3, messageId: 'floatingVoid' }],
    },
    {
      code: `
import { Result } from '@votingworks/types'
declare function rand(): Result<number, Error>
rand()
    `,
      errors: [{ line: 4, messageId: 'floatingVoid' }],
    },
    {
      code: `
import { Result } from '@votingworks/types'
declare function rand(): Result<number, Error>
rand()
    `,
      options: [{ ignoreVoid: false }],
      errors: [{ line: 4, messageId: 'floating' }],
    },
    {
      code: `
import { Result } from '@votingworks/types'
declare function rand(): Result<number, Error>
;(rand(), 1 + 1)
    `,
      errors: [{ line: 4, messageId: 'floatingVoid' }],
    },
    {
      code: `
import { Result } from '@votingworks/types'
declare function rand(): Result<number, Error>
void rand()
    `,
      options: [{ ignoreVoid: false }],
      errors: [{ line: 4, messageId: 'floating' }],
    },
  ],
})
