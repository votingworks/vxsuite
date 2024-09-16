import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_no_return_type_only_generics';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-no-return-type-only-generics', rule, {
  valid: [
    {
      code: `
        function noReturnType() {}
      `,
    },
    {
      code: `
        function noTypeParams(): void {}
      `,
    },
    {
      code: `
        function bigUnionOfSimpleTypes<T>(): number | bigint | string | boolean | object | null | undefined | unknown | any | never | void {}
      `,
    },
    {
      code: `
        function templateLiteralType<T extends string>(value: \`\${T}\`): T {
          return value
        }
      `,
    },
    {
      code: `
        function identity<T>(value: T): T {
          return value
        }
      `,
    },
    {
      code: `
        function defined<T>(value: T | undefined): T {
          assert(typeof value !== 'undefined')
          return value
        }
      `,
    },
    {
      code: `
        function map<T, U>(array: readonly T[], mapFn: (value: T) => U): U[] {
          return array.map(mapFn)
        }
      `,
    },
    {
      code: `
        function memoize<R, F extends () => R>(fn: F): () => R {
          let returnValue: R;
        
          return () => {
            if (typeof returnValue === 'undefined') {
              returnValue = fn();
            }
            return returnValue;
          };
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        async function fetchJSON<T>(url: string): Promise<T> {}
      `,
      errors: [{ messageId: 'noReturnTypeOnlyGenerics', line: 2 }],
    },
    {
      code: `
        const fetchJSON = <T>(url: string): Promise<T> => {}
      `,
      errors: [{ messageId: 'noReturnTypeOnlyGenerics', line: 2 }],
    },
    {
      code: `
        const fetchJSON = function<T>(url: string): Promise<T> {}
      `,
      errors: [{ messageId: 'noReturnTypeOnlyGenerics', line: 2 }],
    },
    {
      code: `
        function typeParameterWithExtends<T extends number>(): T {}
      `,
      errors: [{ messageId: 'noReturnTypeOnlyGenerics', line: 2 }],
    },
    {
      code: `
        function typeParameterWithDefault<T = unknown>(): T {}
      `,
      errors: [{ messageId: 'noReturnTypeOnlyGenerics', line: 2 }],
    },
    {
      code: `
        function typeParameterWithDefault<T = unknown>(): T;
      `,
      errors: [{ messageId: 'noReturnTypeOnlyGenerics', line: 2 }],
    },
  ],
});
