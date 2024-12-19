import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_func_style';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-func-style', rule, {
  valid: [
    {
      // Top level arrow functions may be used to explicitly declare that a
      // function implements an interface.
      code: `const foo: VoidFunction = () => {}`,
    },
    {
      // Use arrow functions assigned to variables instead of function
      // declarations if the function accesses the outer scope's this.
      code: `const foo = () => { this }`,
    },
    {
      // Use arrow functions assigned to variables instead of function
      // declarations if the function accesses the outer scope's this.
      code: `const foo = () => { [].map(() => this) }`,
    },
    {
      code: `const foo = 1`,
    },
    {
      code: `let foo`,
    },
    {
      code: `let {} = () => {}`,
    },
    {
      code: `let [] = () => {}`,
    },
  ],
  invalid: [
    {
      code: `const foo = () => {}`,
      output: `function foo() {}`,
      errors: [{ messageId: 'useFunctionDeclaration', line: 1 }],
    },
    {
      code: `const foo = async () => {}`,
      output: `async function foo() {}`,
      errors: [{ messageId: 'useFunctionDeclaration', line: 1 }],
    },
    {
      code: `
        const Text = (): JSX.Element => {
          return <span />
        }
      `,
      output: `
        function Text(): JSX.Element {
          return <span />
        }
      `,
      errors: [{ messageId: 'useFunctionDeclaration', line: 2 }],
      filename: 'react.tsx',
    },
    {
      code: `
        export const makePollWorkerCard = (
          electionHash: string
        ): PollworkerCardData => ({
          t: 'pollworker',
          h: electionHash,
        })
      `,
      output: `
        export function makePollWorkerCard(
          electionHash: string
        ): PollworkerCardData { return ({
          t: 'pollworker',
          h: electionHash,
        }) }
      `,
      errors: [{ messageId: 'useFunctionDeclaration', line: 2 }],
      filename: 'react.tsx',
    },
    {
      code: `const foo = () => { [].map(function() { this }) }`,
      output: `function foo() { [].map(function() { this }) }`,
      errors: [{ messageId: 'useFunctionDeclaration', line: 1 }],
    },
    {
      code: `const foo = () => {}, bar = () => {}`,
      errors: [
        { messageId: 'useFunctionDeclaration', line: 1 },
        { messageId: 'useFunctionDeclaration', line: 1 },
      ],
    },
    {
      code: `const foo = () => 1`,
      output: `function foo() { return 1 }`,
      errors: [{ messageId: 'useFunctionDeclaration', line: 1 }],
    },
  ],
});
