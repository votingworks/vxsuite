import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_identifiers';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-identifiers', rule, {
  valid: [
    `let abc`,
    `'$abc'`,
    {
      code: `let $0, setXOffset`,
      options: [{ allowedNames: ['$0', '/setX.*/'] }],
    },
    `const abc = 12`,
    `const a_b_c = 12`,
    `function ab_() {}`,
    `function loadHttpUrl() {}`,
    `new XMLHttpRequest()`,
    `function BallotSheetImage() {}`,
    `const ONE = 1`,
    `import { TSESTree } from '@typescript-eslint/utils'`,
    `interface A { imageUrl: string }`,
    `interface A { [keyNAME: string]: string }`,
    `interface A { [propNAME]: string }`,
  ],
  invalid: [
    {
      code: 'let $abc',
      errors: [{ messageId: 'noDollarSign', line: 1 }],
    },
    {
      // Do we ever want to specifically allow jQuery?
      code: `const $button = $('.button')`,
      errors: [{ messageId: 'noDollarSign', line: 1 }],
    },
    {
      // Do we ever want to specifically allow RxJS?
      code: 'let device$',
      errors: [{ messageId: 'noDollarSign', line: 1 }],
    },
    {
      code: 'const illegalnÀme = 12',
      errors: [{ messageId: 'identifiersAllowedCharacters', line: 1 }],
    },
    {
      code: `function loadHTTPURL() {}`,
      errors: [
        {
          messageId: 'noAbbreviations',
          line: 1,
          suggestions: [
            {
              messageId: 'useCamelCase',
              output: 'function loadHttpurl() {}',
            },
          ],
        },
      ],
    },
    {
      code: `let a = { imageURL: '/logo.png' }`,
      errors: [{ messageId: 'noAbbreviations', line: 1 }],
    },
    {
      code: `interface A { imageURL: string }`,
      errors: [{ messageId: 'noAbbreviations', line: 1 }],
    },
    {
      code: `export * as ElectionADT from './election_adt'`,
      errors: [{ messageId: 'noAbbreviations', line: 1 }],
    },
  ],
});
