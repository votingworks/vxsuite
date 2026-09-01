import { RuleTester } from '@typescript-eslint/rule-tester';
import { join } from 'node:path';
import rule from '../../src/rules/no_import_workspace_subfolders';

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2018,
      tsconfigRootDir: join(__dirname, '../fixtures'),
      project: './tsconfig.json',
    },
  },
});

ruleTester.run('no-import-workspace-subfolders', rule, {
  valid: [
    {
      code: `import 'a'`,
    },
    {
      code: `import a from '@votingworks/something'`,
    },
    {
      code: `import { a } from '@votingworks/something'`,
    },
    {
      code: `import * as a from '@votingworks/something'`,
    },
    {
      code: `import a from 'random-library/something'`,
    },
    {
      code: `import { a } from 'random-library'`,
    },
    {
      code: `import * as a from 'random/library/with/many/slashes'`,
    },
  ],
  invalid: [
    {
      code: `import a from '@votingworks/something/src'`,
      errors: [
        {
          messageId: 'noImportSubfolders',
          line: 1,
          suggestions: [
            {
              messageId: 'importEntryPoint',
              data: { packageName: '@votingworks/something' },
              output: `import a from '@votingworks/something'`,
            },
          ],
        },
      ],
    },
    {
      code: `import { a } from '@votingworks/something/src'`,
      errors: [
        {
          messageId: 'noImportSubfolders',
          line: 1,
          suggestions: [
            {
              messageId: 'importEntryPoint',
              data: { packageName: '@votingworks/something' },
              output: `import { a } from '@votingworks/something'`,
            },
          ],
        },
      ],
    },
    {
      code: `import * as a from '@votingworks/something/src'`,
      errors: [
        {
          messageId: 'noImportSubfolders',
          line: 1,
          suggestions: [
            {
              messageId: 'importEntryPoint',
              data: { packageName: '@votingworks/something' },
              output: `import * as a from '@votingworks/something'`,
            },
          ],
        },
      ],
    },
    {
      code: `import a from '@votingworks/something/utils'`,
      errors: [
        {
          messageId: 'noImportSubfolders',
          line: 1,
          suggestions: [
            {
              messageId: 'importEntryPoint',
              data: { packageName: '@votingworks/something' },
              output: `import a from '@votingworks/something'`,
            },
          ],
        },
      ],
    },
    {
      code: `import { a } from '@votingworks/something/src/utils/lib'`,
      errors: [
        {
          messageId: 'noImportSubfolders',
          line: 1,
          suggestions: [
            {
              messageId: 'importEntryPoint',
              data: { packageName: '@votingworks/something' },
              output: `import { a } from '@votingworks/something'`,
            },
          ],
        },
      ],
    },
    {
      code: `import * as a from '@votingworks/something/src/utils'`,
      errors: [
        {
          messageId: 'noImportSubfolders',
          line: 1,
          suggestions: [
            {
              messageId: 'importEntryPoint',
              data: { packageName: '@votingworks/something' },
              output: `import * as a from '@votingworks/something'`,
            },
          ],
        },
      ],
    },
    {
      code: `import { a } from '@votingworks/types/src'`,
      errors: [
        {
          messageId: 'noImportSubfolders',
          line: 1,
          suggestions: [
            {
              messageId: 'importEntryPoint',
              data: { packageName: '@votingworks/types' },
              output: `import { a } from '@votingworks/types'`,
            },
          ],
        },
      ],
    },
  ],
});
