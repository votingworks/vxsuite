import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_no_default_exports';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-no-default-exports', rule, {
  valid: [
    `export const a = 1;`,
    `export function a() {}`,
    `export { a };`,
    `import a from 'a';`,
    `import a from '../data/a.json';`,
  ],
  invalid: [
    {
      code: `export default 1;`,
      errors: [{ messageId: 'noDefaultExports', line: 1 }],
    },
    {
      code: `export { default as a } from './a';`,
      errors: [{ messageId: 'noDefaultExports', line: 1 }],
      output: `export { a } from './a';`,
    },
    {
      code: `import a from './a';`,
      errors: [{ messageId: 'noDefaultImports', line: 1 }],
      output: `import { a } from './a';`,
    },
    {
      code: `import a, { b } from './a';`,
      errors: [{ messageId: 'noDefaultImports', line: 1 }],
      output: `import { a, b } from './a';`,
    },
    {
      code: `const a = 1; export default a;`,
      errors: [
        {
          messageId: 'noDefaultExports',
          line: 1,
        },
      ],
      output: `export const a = 1; `,
    },
    {
      code: `export default class A {};`,
      errors: [
        {
          messageId: 'noDefaultExports',
          line: 1,
        },
      ],
      output: `export class A {};`,
    },
    {
      code: `export default function a() {};`,
      errors: [
        {
          messageId: 'noDefaultExports',
          line: 1,
        },
      ],
      output: `export function a() {};`,
    },
    {
      code: `import a from 'a'; export default a;`,
      errors: [
        {
          messageId: 'noDefaultExports',
          line: 1,
        },
      ],
    },
    {
      code: `export const a = 1; export default a;`,
      errors: [
        {
          messageId: 'noDefaultExports',
          line: 1,
        },
      ],
      output: `export const a = 1; `,
    },
    {
      code: `function a() {}; export default a;`,
      errors: [
        {
          messageId: 'noDefaultExports',
          line: 1,
        },
      ],
      output: `export function a() {}; `,
    },
    {
      code: `const a = 1, b = 2; export default a;`,
      errors: [
        {
          messageId: 'noDefaultExports',
          line: 1,
        },
      ],
    },
    {
      code: `export default a;`,
      errors: [
        {
          messageId: 'noDefaultExports',
          line: 1,
        },
      ],
    },
    {
      code: `var a = 1; var a = 2; export default a;`,
      errors: [
        {
          messageId: 'noDefaultExports',
          line: 1,
        },
      ],
    },
  ],
});
