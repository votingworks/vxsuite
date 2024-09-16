import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_module_snake_case';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-module-snake-case', rule, {
  valid: [
    { code: 'const a = 1;', filename: 'file.ts' },
    { code: 'const a = 1;', filename: 'snake_case.ts' },
    { code: 'const a = 1;', filename: 'setupTests.ts' },
  ],
  invalid: [
    {
      code: 'const a = 1;',
      filename: 'camelCase.ts',
      errors: [
        {
          messageId: 'useSnakeCase',
          line: 1,
          data: { snakeCaseFileName: 'camel_case.ts' },
        },
      ],
    },
    {
      code: 'const a = 1;',
      filename: 'TitleCase.tsx',
      errors: [
        {
          messageId: 'useSnakeCase',
          line: 1,
          data: { snakeCaseFileName: 'title_case.tsx' },
        },
      ],
    },
  ],
});
