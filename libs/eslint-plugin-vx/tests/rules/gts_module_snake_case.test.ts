import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import { join } from 'path';
import rule from '../../src/rules/gts_module_snake_case';

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
});

ruleTester.run('gts-module-snake-case', rule, {
  valid: [
    { code: 'const a = 1;', filename: 'file.ts' },
    { code: 'const a = 1;', filename: 'snake_case.ts' },
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
