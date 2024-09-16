import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_use_optionals';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

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
    {
      // ignore this weird `Optional` with no type params, it isn't ours
      code: 'interface A { a: Optional }',
    },
    {
      // ignore this weird `Optional` with two type params, it isn't ours
      code: 'interface A { a: Optional<boolean, string> }',
    },
  ],
  invalid: [
    {
      code: 'interface A { a: boolean | undefined }',
      output: 'interface A { a?: boolean   }',
      errors: [{ messageId: 'useOptionalInterfaceProperties', line: 1 }],
    },
    {
      code: 'interface A { a: undefined | boolean }',
      output: 'interface A { a?:   boolean }',
      errors: [{ messageId: 'useOptionalInterfaceProperties', line: 1 }],
    },
    {
      code: 'interface A { a?: boolean | undefined }',
      output: 'interface A { a?: boolean   }',
      errors: [{ messageId: 'useOptionalInterfaceProperties', line: 1 }],
    },
    {
      code: 'interface A { a: Optional<boolean> }',
      output: 'interface A { a?: boolean }',
      errors: [{ messageId: 'useOptionalInterfaceProperties', line: 1 }],
    },
    {
      code: 'type A = { a: boolean | undefined }',
      output: 'type A = { a?: boolean   }',
      errors: [{ messageId: 'useOptionalInterfaceProperties', line: 1 }],
    },
    {
      code: 'type A = { a: Optional<boolean> }',
      output: 'type A = { a?: boolean }',
      errors: [{ messageId: 'useOptionalInterfaceProperties', line: 1 }],
    },
    {
      code: 'class A { a: boolean | undefined }',
      output: 'class A { a?: boolean   }',
      errors: [{ messageId: 'useOptionalClassFields', line: 1 }],
    },
    {
      code: 'class A { a: Optional<boolean> }',
      output: 'class A { a?: boolean }',
      errors: [{ messageId: 'useOptionalClassFields', line: 1 }],
    },
    {
      code: 'class A { constructor(private a: boolean | undefined) {} }',
      output: 'class A { constructor(private a?: boolean  ) {} }',
      errors: [{ messageId: 'useOptionalClassFields', line: 1 }],
    },
    {
      code: 'class A { constructor(private a: Optional<boolean>) {} }',
      output: 'class A { constructor(private a?: boolean) {} }',
      errors: [{ messageId: 'useOptionalClassFields', line: 1 }],
    },
    {
      code: 'function a(a: boolean | undefined) {}',
      output: 'function a(a?: boolean  ) {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'function a(a: Optional<boolean>) {}',
      output: 'function a(a?: boolean) {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'function a(a: boolean | undefined = true) {}',
      output: 'function a(a?: boolean   = true) {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'const a = function ({}: {} | undefined) {}',
      output: 'const a = function ({}?: {}  ) {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'const a = function ({}: Optional<{}>) {}',
      output: 'const a = function ({}?: {}) {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'const a = ([]: [0, 1] | undefined) => {}',
      output: 'const a = ([]?: [0, 1]  ) => {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'const a = ([]: Optional<[0, 1]>) => {}',
      output: 'const a = ([]?: [0, 1]) => {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'interface A { a(b: boolean | undefined): void }',
      output: 'interface A { a(b?: boolean  ): void }',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'interface A { a: (b: boolean | undefined) => void }',
      output: 'interface A { a: (b?: boolean  ) => void }',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
    {
      code: 'function a(a: boolean | undefined, b?: boolean) {}',
      output: 'function a(a?: boolean  , b?: boolean) {}',
      errors: [{ messageId: 'useOptionalParams', line: 1 }],
    },
  ],
});
