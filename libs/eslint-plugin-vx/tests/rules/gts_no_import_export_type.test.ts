import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_no_import_export_type';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-no-import-export-type', rule, {
  valid: [
    {
      code: `import a from 'a'`,
    },
    {
      code: `import { a } from 'a'`,
    },
    {
      code: `import 'a'`,
    },
    {
      code: `import * as a from 'a'`,
    },
    {
      code: `export { a }`,
    },
    {
      code: `export const a = 1`,
    },
    {
      code: `export type Id = string`,
    },
    {
      code: `import type { a } from 'a'; export type { a }`,
      options: [{ allowReexport: true }],
    },
    {
      code: `import type * as a from 'a'; export type { a }`,
      options: [{ allowReexport: true }],
    },
    {
      code: `export type { a } from 'a'`,
      options: [{ allowReexport: true }],
    },
    {
      code: `export type * as a from 'a'`,
      options: [{ allowReexport: true }],
    },
  ],
  invalid: [
    {
      code: `import type a from 'a'`,
      output: `import a from 'a'`,
      errors: [{ line: 1, messageId: 'noImportType' }],
    },
    {
      code: `import type a from 'a'`,
      output: `import a from 'a'`,
      options: [{ allowReexport: true }],
      errors: [{ line: 1, messageId: 'noImportType' }],
    },
    {
      code: `import type { a } from 'a'`,
      output: `import { a } from 'a'`,
      errors: [{ line: 1, messageId: 'noImportType' }],
    },
    {
      code: `import type { a } from 'a'`,
      output: `import { a } from 'a'`,
      options: [{ allowReexport: true }],
      errors: [{ line: 1, messageId: 'noImportType' }],
    },
    {
      code: `import type * as a from 'a'`,
      output: `import * as a from 'a'`,
      errors: [{ line: 1, messageId: 'noImportType' }],
    },
    {
      code: `import type * as a from 'a'`,
      output: `import * as a from 'a'`,
      options: [{ allowReexport: true }],
      errors: [{ line: 1, messageId: 'noImportType' }],
    },
    {
      code: `export type { a }`,
      output: `export { a }`,
      errors: [{ line: 1, messageId: 'noExportType' }],
    },
    {
      code: `export type { a }`,
      output: `export { a }`,
      options: [{ allowReexport: true }],
      errors: [{ line: 1, messageId: 'noExportType' }],
    },
    {
      code: `export type * as a from 'a'`,
      output: `export * as a from 'a'`,
      errors: [{ line: 1, messageId: 'noExportType' }],
    },
    {
      code: `
        import type * as a from 'a'
        import type { b } from 'b'
        type c = string
        export type { a, b, c }
      `,
      output: `
        import type * as a from 'a'
        import type { b } from 'b'
        type c = string
        export { a, b, c }
      `,
      options: [{ allowReexport: true }],
      errors: [{ line: 5, messageId: 'noExportType' }],
    },
    {
      code: `
        import type { b } from 'b';
        let b;
      `,
      output: `
        import { b } from 'b';
        let b;
      `,
      options: [{ allowReexport: true }],
      errors: [{ line: 2, messageId: 'noImportType' }],
    },
    {
      code: `
        import type { b } from 'b';
        let a: b;
      `,
      output: `
        import { b } from 'b';
        let a: b;
      `,
      options: [{ allowReexport: true }],
      errors: [{ line: 2, messageId: 'noImportType' }],
    },
  ],
});
