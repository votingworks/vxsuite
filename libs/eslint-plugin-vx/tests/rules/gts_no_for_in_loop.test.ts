import { ESLintUtils } from '@typescript-eslint/utils';
import { join } from 'path';
import rule from '../../src/rules/gts_no_for_in_loop';

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
});

ruleTester.run('gts-no-for-in-loop', rule, {
  valid: [
    { code: 'for (const k of Object.keys({})) {}' },
    { code: 'for (const [k, v] of Object.entries({})) {}' },
  ],
  invalid: [
    {
      code: 'for (const k in {}) {}',
      output: 'for (const k of Object.keys({})) {}',
      errors: [{ messageId: 'noForInLoop', line: 1 }],
    },
    {
      code: `
        for (const k in o) {
          if (o.hasOwnProperty(k)) {
            o[k] = 1
          }
        }
      `,
      output: `
        for (const k of Object.keys(o)) {
          if (o.hasOwnProperty(k)) {
            o[k] = 1
          }
        }
      `,
      errors: [{ messageId: 'noForInLoop', line: 2 }],
    },
  ],
});
