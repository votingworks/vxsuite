import { RuleTester } from '@typescript-eslint/rule-tester';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import rule from '../../src/rules/no_import_workspace_subfolders';

// A throwaway package tree so the rule's `node_modules` lookup finds a package
// that declares a subpath in its `exports` map.
const packageRoot = mkdtempSync(join(tmpdir(), 'vx-eslint-subfolders-'));
const exportingPackageDir = join(
  packageRoot,
  'node_modules',
  '@votingworks',
  'exporting-lib'
);
mkdirSync(exportingPackageDir, { recursive: true });
writeFileSync(
  join(exportingPackageDir, 'package.json'),
  JSON.stringify({
    name: '@votingworks/exporting-lib',
    exports: { '.': './build/index.js', './browser': './build/browser.js' },
  })
);
const filename = join(packageRoot, 'file.ts');

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

// The `exports`-map cases need a filename outside the fixtures tsconfig, so
// they run without `parserOptions.project`. The rule needs no type information.
const untypedRuleTester = new RuleTester({
  languageOptions: {
    parserOptions: { ecmaVersion: 2018, sourceType: 'module' },
  },
});

untypedRuleTester.run('no-import-workspace-subfolders (exports map)', rule, {
  valid: [
    {
      // A subpath the package declares in its `exports` map is public API.
      code: `import { a } from '@votingworks/exporting-lib/browser'`,
      filename,
    },
  ],
  invalid: [
    {
      // An undeclared subpath of a package that has an `exports` map is still
      // internals.
      code: `import { a } from '@votingworks/exporting-lib/src/browser'`,
      filename,
      errors: [
        {
          messageId: 'noImportSubfolders',
          line: 1,
          suggestions: [
            {
              messageId: 'importEntryPoint',
              data: { packageName: '@votingworks/exporting-lib' },
              output: `import { a } from '@votingworks/exporting-lib'`,
            },
          ],
        },
      ],
    },
  ],
});
