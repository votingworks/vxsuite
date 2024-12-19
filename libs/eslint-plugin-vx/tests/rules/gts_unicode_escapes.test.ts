import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_unicode_escapes';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-unicode-escapes', rule, {
  valid: [
    `1`,
    `''`,
    '``',
    `'∞'`,
    `'👍'`,
    '"hello world"',
    `'\\x00' // null byte`,
    `'\\u{0}' // null byte`,
    `const nil = '\\u0000'; // raw NULL byte`,
    `
      const chars = {
        nil: '\\u0000', // raw NULL byte
      };
    `,
    `'\\n'`,
    '`\n`',
    `
      // escaped slash does not start escape sequence
      '\\\\x40'
    `,
    `
      // allow escaped newline
      '\\u000a'
    `,
    `
      // allow escaped carriage return
      '\\u000d'
    `,
    `expect(output).toEqual('\\x00'); // raw NULL byte`,
  ],
  invalid: [
    {
      code: `'\u0000'`, // raw NULL byte
      errors: [
        { messageId: 'useEscapeSequenceForNonPrintableCharacter', line: 1 },
      ],
      output: `'\\u0000'`,
    },
    {
      code: `'\\u221e'`,
      errors: [{ messageId: 'useLiteralPrintableCharacter', line: 1 }],
      output: `'∞'`,
    },
    {
      code: `'\\x40'`,
      errors: [{ messageId: 'useLiteralPrintableCharacter', line: 1 }],
      output: `'@'`,
    },
    {
      code: `'\\\\\\x40'`,
      errors: [{ messageId: 'useLiteralPrintableCharacter', line: 1 }],
      output: `'\\\\@'`,
    },
    {
      code: '`\\u221e123`',
      errors: [{ messageId: 'useLiteralPrintableCharacter', line: 1 }],
      output: '`∞123`',
    },
    {
      code: '`\\u{40}`',
      errors: [{ messageId: 'useLiteralPrintableCharacter', line: 1 }],
      output: '`@`',
    },
    {
      code: '`\\x00`',
      errors: [{ messageId: 'escapeSequenceMissingComment', line: 1 }],
    },
    {
      // eslint-disable-next-line no-template-curly-in-string
      code: '`${"abc"}\\x00`',
      errors: [{ messageId: 'escapeSequenceMissingComment', line: 1 }],
    },
    {
      code: `
        const nil = '\\x00';

        // do something with it
        console.log(nil);
      `,
      errors: [{ messageId: 'escapeSequenceMissingComment', line: 2 }],
    },
  ],
});
