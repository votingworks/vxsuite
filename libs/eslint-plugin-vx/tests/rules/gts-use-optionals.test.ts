import { ESLintUtils } from '@typescript-eslint/experimental-utils'
import { join } from 'path'
import rule from '../../src/rules/gts-use-optionals'

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
})

ruleTester.run('gts-no-use-optionals', rule, {
  valid: [
    {
      code: 'interface A { a?: boolean }',
    },
    {
      // index signatures do not allow optional properties
      code: 'interface A { [key: string]: boolean | undefined }',
    },
    {
      code: 'type A = { a?: boolean }',
    },
    {
      code: 'class A { a?: boolean }',
    },
    {
      code: 'function a(a?: boolean) {}',
    },
    {
      code: 'function a(a: boolean | undefined, b: boolean) {}',
    },
    {
      code: 'interface A { a(b?: boolean): void }',
    },
    {
      code: 'interface A { a: (b?: boolean) => void }',
    },
  ],
  invalid: [
    {
      code: 'interface A { a: boolean | undefined }',
      errors: [{ messageId: 'useOptionalInterfaceProperties', line: 1 }],
    },
    {
      code: 'interface A { a?: boolean | undefined }',
      errors: [{ messageId: 'useOptionalInterfaceProperties', line: 1 }],
    },
    {
      code: 'interface A { a: Optional<boolean> }',
      errors: [{ messageId: 'useOptionalInterfaceProperties', line: 1 }],
    },
    {
      code: 'type A = { a: boolean | undefined }',
      errors: [{ messageId: 'useOptionalInterfaceProperties', line: 1 }],
    },
    {
      code: 'type A = { a: Optional<boolean> }',
      errors: [{ messageId: 'useOptionalInterfaceProperties', line: 1 }],
    },
    {
      code: 'class A { a: boolean | undefined }',
      errors: [{ messageId: 'useOptionalClassFields', line: 1 }],
    },
    {
      code: 'class A { a: Optional<boolean> }',
      errors: [{ messageId: 'useOptionalClassFields', line: 1 }],
    },
    {
      code: 'class A { constructor(private a: boolean | undefined) {} }',
      errors: [{ messageId: 'useOptionalClassFields', line: 1 }],
    },
    {
      code: 'class A { constructor(private a: Optional<boolean>) {} }',
      errors: [{ messageId: 'useOptionalClassFields', line: 1 }],
    },
    {
      code: 'function a(a: boolean | undefined) {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'function a(a: Optional<boolean>) {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'function a(a: boolean | undefined = true) {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'const a = function ({}: {} | undefined) {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'const a = function ({}: Optional<{}>) {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'const a = ([]: [0, 1] | undefined) => {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'const a = ([]: Optional<[0, 1]>) => {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'interface A { a(b: boolean | undefined): void }',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'interface A { a: (b: boolean | undefined) => void }',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'function a(a: boolean | undefined, b?: boolean) {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
  ],
})
