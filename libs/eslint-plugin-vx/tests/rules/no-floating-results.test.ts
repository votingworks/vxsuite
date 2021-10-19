import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { join } from 'path';
import rule from '../../src/rules/no-floating-results';

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
});

ruleTester.run('no-floating-results', rule, {
  valid: [
    `
interface Result<T, E> {}
declare function ok<T, E>(value: T): Result<T, E>
    `,
    {
      options: [{ ignoreVoid: true }],
      code: `
interface Result {}
declare function ok<T, E>(value: T): Result<T, E>
void ok()
            `,
    },
  ],
  invalid: [
    {
      code: `
interface Result<T, E> {}
declare function ok<T, E>(value: T): Result<T, E>
ok()
            `,
      errors: [{ line: 4, messageId: 'floatingVoid' }],
    },
    {
      code: `
interface Result<T, E> {}
declare function rand(): Result<number, Error>
rand()
        `,
      errors: [{ line: 4, messageId: 'floatingVoid' }],
    },
    {
      code: `
interface Result<T, E> {}
declare function rand(): Result<number, Error>
rand()
            `,
      options: [{ ignoreVoid: false }],
      errors: [{ line: 4, messageId: 'floating' }],
    },
    {
      code: `
interface Result<T, E> {}
declare function rand(): Result<number, Error>
;(rand(), 1 + 1)
        `,
      errors: [{ line: 4, messageId: 'floatingVoid' }],
    },
    {
      code: `
interface Result<T, E> {}
declare function rand(): Result<number, Error>
void rand()
        `,
      options: [{ ignoreVoid: false }],
      errors: [{ line: 4, messageId: 'floating' }],
    },
  ],
});
