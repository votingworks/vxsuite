import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { join } from 'path';
import rule from '../../src/rules/gts-identifiers-use-allowed-characters';

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
});

ruleTester.run('gts-identifiers-use-allowed-characters', rule, {
  valid: [
    { code: `const abc = 12` },
    { code: `const a_b_c = 12` },
    { code: `function ab_() {}` },
    {
      code: `const $button = $('.button')`,
    }, // dollar signs are handled by the separate gts-no-dollar-sign-names rule
  ],
  invalid: [
    {
      code: 'const illegalnÀme = 12',
      errors: [{ messageId: 'identifiersAllowedCharacters', line: 1 }],
    },
  ],
});
