import { RuleTester } from '@typescript-eslint/rule-tester';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import rule from '../../src/rules/no_esm_workspace_import_in_test_setup';

// A throwaway package tree so the rule's `node_modules` lookup has real
// packages to find: one ESM, one CommonJS, plus one with unreadable JSON.
const packageRoot = mkdtempSync(join(tmpdir(), 'vx-eslint-esm-setup-'));

function writePackage(name: string, packageJson: string): void {
  const dir = join(packageRoot, 'node_modules', '@votingworks', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), packageJson);
}

writePackage(
  'esm-lib',
  JSON.stringify({ name: '@votingworks/esm-lib', type: 'module' })
);
writePackage('cjs-lib', JSON.stringify({ name: '@votingworks/cjs-lib' }));
writePackage('broken-lib', 'not json at all');

const filename = join(packageRoot, 'test', 'setupTests.ts');

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: { ecmaVersion: 2018, sourceType: 'module' },
  },
});

ruleTester.run('no-esm-workspace-import-in-test-setup', rule, {
  valid: [
    // Not a workspace package.
    { code: `import { a } from 'some-library'`, filename },
    { code: `import { a } from './relative'`, filename },
    // Workspace package that is still CommonJS.
    { code: `import { a } from '@votingworks/cjs-lib'`, filename },
    // Type-only imports are erased, so they load nothing.
    { code: `import type { A } from '@votingworks/esm-lib'`, filename },
    // Unresolvable packages are not reported: the rule fails open.
    { code: `import { a } from '@votingworks/not-installed'`, filename },
    // A package whose package.json cannot be parsed is treated as not ESM.
    { code: `import { a } from '@votingworks/broken-lib'`, filename },
    // The rule is only enabled for setup files by config, but it should also
    // behave when a file resolves nothing at all.
    {
      code: `import { a } from '@votingworks/esm-lib'`,
      filename: '/nowhere/setupTests.ts',
    },
  ],
  invalid: [
    {
      code: `import { a } from '@votingworks/esm-lib'`,
      filename,
      errors: [
        {
          messageId: 'noEagerEsmImport',
          data: { packageName: '@votingworks/esm-lib' },
        },
      ],
    },
    {
      // A subpath import still loads the package.
      code: `import { a } from '@votingworks/esm-lib/sub'`,
      filename,
      errors: [
        {
          messageId: 'noEagerEsmImport',
          data: { packageName: '@votingworks/esm-lib' },
        },
      ],
    },
    {
      // Side-effect-only imports load the package too.
      code: `import '@votingworks/esm-lib'`,
      filename,
      errors: [
        {
          messageId: 'noEagerEsmImport',
          data: { packageName: '@votingworks/esm-lib' },
        },
      ],
    },
  ],
});
