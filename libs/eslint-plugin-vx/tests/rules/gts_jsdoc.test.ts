import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import * as ts from 'typescript';
import { join } from 'node:path';
import rule from '../../src/rules/gts_jsdoc';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

const tsSupportsOverride = 'OverrideKeyword' in ts.SyntaxKind;

ruleTester.run('gts-jsdoc', rule, {
  valid: [
    tsSupportsOverride
      ? `
      class Foo extends Bar {
        override doSomething() {}
      }
    `
      : `
      class Foo extends bar {
        doSomething() {}
      }
    `,
    `
      // ignore line comments @override @implements @extends @enum
    `,
    `/** @see {@link foo} */`,
    `
      /** The loneliest number. */
      export const ONE = 1;
    `,
    `
      /** The loneliest number. */
      export default 1;
    `,
    `
      /** The loneliest number. */
      const ONE = 1;
      export default ONE;
    `,
    `
      /** The loneliest number. */
      export const ONE = 1,
      /** The loneliest number since the number one. */
                   TWO = 2;
    `,
    `
      /** The loneliest number. */
      export function ONE() { return 1; };
    `,
    `
      /** The loneliest number. */
      const one = 1;
      /** The loneliest number since the number one. */
      const two = 2;
      export { one as ONE, two as TWO };
    `,
  ],
  invalid: [
    {
      code: '/** @override */',
      errors: [{ messageId: 'noJsDocOverride', line: 1 }],
    },
    {
      code: '/** @implements */',
      errors: [{ messageId: 'noJsDocImplements', line: 1 }],
    },
    {
      code: '/** @extends */',
      errors: [{ messageId: 'noJsDocExtends', line: 1 }],
    },
    {
      code: '/** @enum */',
      errors: [{ messageId: 'noJsDocEnum', line: 1 }],
    },
    {
      code: '/** @private */',
      errors: [{ messageId: 'noJsDocPrivate', line: 1 }],
    },
    {
      code: '/** @protected */',
      errors: [{ messageId: 'noJsDocProtected', line: 1 }],
    },
    {
      code: '/** @type {number} */',
      errors: [{ messageId: 'noJsDocType', line: 1 }],
    },
    {
      code: `
        /**
         * @param {number} a
         * @param {number} b
         * @returns {number}
         */
        function add(a: number, b: number): number {
          return a + b;
        }
      `,
      errors: [
        { messageId: 'noJsDocType' },
        { messageId: 'noJsDocType' },
        { messageId: 'noJsDocType' },
      ],
    },
    {
      code: `export const ONE = 1;`,
      errors: [{ messageId: 'moduleExportRequiresJsDoc', line: 1 }],
    },
    {
      code: `export const ONE = 1, TWO = 2;`,
      errors: [
        { messageId: 'moduleExportRequiresJsDoc', line: 1 },
        { messageId: 'moduleExportRequiresJsDoc', line: 1 },
      ],
    },
    {
      code: `export function ONE() { return 1; }`,
      errors: [{ messageId: 'moduleExportRequiresJsDoc', line: 1 }],
    },
    {
      code: `
        const ONE = 1;
        const TWO = 2;
        export { ONE, TWO };
      `,
      errors: [
        { messageId: 'moduleExportRequiresJsDoc', line: 2 },
        { messageId: 'moduleExportRequiresJsDoc', line: 3 },
      ],
    },
  ],
});
