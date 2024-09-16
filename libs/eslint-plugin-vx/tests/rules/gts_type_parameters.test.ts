import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_type_parameters';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-type-parameters', rule, {
  valid: [
    `type Optional<T> = T | undefined;`,
    `type Optional<SomeType> = SomeType | undefined;`,
    `type Optional<T0> = T0 | undefined;`,
  ],
  invalid: [
    {
      code: `type Optional<t> = t | undefined;`,
      errors: [
        {
          messageId: 'typeParametersMustHaveSingleLetterOrUpperCamelCaseName',
          line: 1,
        },
      ],
    },
    {
      code: `type Optional<TYPE> = TYPE | undefined;`,
      errors: [
        {
          messageId: 'typeParametersMustHaveSingleLetterOrUpperCamelCaseName',
          line: 1,
        },
      ],
    },
    {
      code: `type Optional<someType> = someType | undefined;`,
      errors: [
        {
          messageId: 'typeParametersMustHaveSingleLetterOrUpperCamelCaseName',
          line: 1,
        },
      ],
    },
    {
      code: `type Optional<Some_Type> = Some_Type | undefined;`,
      errors: [
        {
          messageId: 'typeParametersMustHaveSingleLetterOrUpperCamelCaseName',
          line: 1,
        },
      ],
    },
  ],
});
