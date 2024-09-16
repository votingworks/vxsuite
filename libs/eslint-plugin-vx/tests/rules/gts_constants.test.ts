import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_constants';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-constants', rule, {
  valid: [
    `const ONE = 1;`,
    `const A_CONSTANT_1234 = 1;`,
    `let ALMOST_CONSTANt = 1;`,
  ],
  invalid: [
    {
      code: `let A_CONSTANT;`,
      errors: [{ messageId: 'useConstVariableDeclaration', line: 1 }],
    },
    {
      code: `var A_CONSTANT;`,
      errors: [{ messageId: 'useConstVariableDeclaration', line: 1 }],
    },
  ],
});
