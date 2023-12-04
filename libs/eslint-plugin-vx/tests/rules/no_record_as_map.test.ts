import { join } from 'path';
import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import rule from '../../src/rules/no_record_as_map';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('no-record-as-map', rule, {
  valid: [
    `type Foo = Map<string, number>`,
    // escape hatch in case we need to use `Record`
    `type Foo = { [key: string]: number }`,
    `class Record {}`,
    `type Foo = Record`,
    `type Foo = Record<number, string>`,
    `const GLOBALS = { a: 1 } as const; type Foo = Record<keyof typeof GLOBALS, string>`,
    `Object.entries({})`,
    `Object.values({})`,
    `Object.keys({})`,
  ],
  invalid: [
    {
      code: `type Foo = Record<string, number>`,
      errors: [{ line: 1, messageId: 'noRecordAsMap' }],
    },
    {
      code: `function foo(): Record<string, number> { return {}; }`,
      errors: [{ line: 1, messageId: 'noRecordAsMap' }],
    },
    {
      code: `function foo(arg: Record<string, number>) {}`,
      errors: [{ line: 1, messageId: 'noRecordAsMap' }],
    },
    {
      code: `type ContestId = string; type Foo = Record<ContestId, number>`,
      errors: [{ line: 1, messageId: 'noRecordAsMap' }],
    },
    {
      code: `type ContestId = string | number; type Foo = Record<ContestId, number>`,
      errors: [{ line: 1, messageId: 'noRecordAsMap' }],
    },
    {
      code: `Object.entries(new Map())`,
      errors: [{ line: 1, messageId: 'noObjectEntriesOnMap' }],
    },
    {
      code: `Object.values(new Map())`,
      errors: [{ line: 1, messageId: 'noObjectValuesOnMap' }],
    },
    {
      code: `Object.keys(new Map())`,
      errors: [{ line: 1, messageId: 'noObjectKeysOnMap' }],
    },
    {
      code: `function debug(obj: Map<string, number> | { [key: string]: number }) { Object.entries(obj); }`,
      errors: [{ line: 1, messageId: 'noObjectEntriesOnMap' }],
    },
  ],
});
