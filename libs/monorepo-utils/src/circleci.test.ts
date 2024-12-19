import { expect, test } from 'vitest';
import { join } from 'node:path';
import { generateConfig } from './circleci';
import { getWorkspacePackageInfo } from './pnpm';
import { getRustPackageIds } from '.';

test('generateConfig', async () => {
  const root = join(__dirname, '../../..');
  const config = generateConfig(
    getWorkspacePackageInfo(root),
    await getRustPackageIds(root)
  );
  expect(config).toContain('test-libs-basics');
});
