import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_safe_number_parse';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-safe-number-parse', rule, {
  valid: ['parseInt(value, radix)', 'parseFloat(value, radix)'],
  invalid: [
    {
      code: 'parseInt(1)',
      errors: [{ messageId: 'useSafeParseInteger', line: 1 }],
    },
    {
      code: 'parseInt(1, 10)',
      errors: [{ messageId: 'useSafeParseInteger', line: 1 }],
    },
    {
      code: 'parseFloat(1)',
      errors: [{ messageId: 'useSafeParseNumber', line: 1 }],
    },
    {
      code: '+event.target.value',
      errors: [{ messageId: 'useSafeParseNumber', line: 1 }],
    },
    {
      code: 'Number(event.target.value)',
      errors: [{ messageId: 'useSafeParseNumber', line: 1 }],
    },
    {
      code: 'new Number(event.target.value)',
      errors: [{ messageId: 'useSafeParseNumber', line: 1 }],
    },
  ],
});
