import { expect, test } from 'vitest';
import { join } from 'node:path';
import { generateConfig } from './circleci';
import { getWorkspacePackageInfo } from './pnpm';

test('generateConfig', () => {
  const root = join(__dirname, '../../..');
  const config = generateConfig(getWorkspacePackageInfo(root));
  expect(config).toContain('test-libs-basics');
  expect(config).toContain('test-rust-crates');
});
