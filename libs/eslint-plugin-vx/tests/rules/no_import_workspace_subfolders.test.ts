import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/no_import_workspace_subfolders';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
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
    {
      code: `import a from '@votingworks/types/something/else'`,
    },
    {
      code: `import { a } from '@votingworks/types/api/services/scan'`,
    },
    {
      code: `import * as a from '@votingworks/types/a/bunch/of/folders'`,
    },
  ],
  invalid: [
    {
      code: `import a from '@votingworks/something/src'`,
      output: `import a from '@votingworks/something'`,
      errors: [{ messageId: 'noImportSubfolders', line: 1 }],
    },
    {
      code: `import { a } from '@votingworks/something/src'`,
      output: `import { a } from '@votingworks/something'`,
      errors: [{ messageId: 'noImportSubfolders', line: 1 }],
    },
    {
      code: `import * as a from '@votingworks/something/src'`,
      output: `import * as a from '@votingworks/something'`,
      errors: [{ messageId: 'noImportSubfolders', line: 1 }],
    },
    {
      code: `import a from '@votingworks/something/utils'`,
      output: `import a from '@votingworks/something'`,
      errors: [{ messageId: 'noImportSubfolders', line: 1 }],
    },
    {
      code: `import { a } from '@votingworks/something/src/utils/lib'`,
      output: `import { a } from '@votingworks/something'`,
      errors: [{ messageId: 'noImportSubfolders', line: 1 }],
    },
    {
      code: `import * as a from '@votingworks/something/src/utils'`,
      output: `import * as a from '@votingworks/something'`,
      errors: [{ messageId: 'noImportSubfolders', line: 1 }],
    },
  ],
});
