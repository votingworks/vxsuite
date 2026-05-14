import { expect, test } from 'vitest';
import { join } from 'node:path';
import { assert } from '@votingworks/basics';
import { generateAllConfigs } from './circleci';
import { getWorkspacePackageInfo } from './pnpm';

test('generateConfig', () => {
  const root = join(__dirname, '../../..');
  const configs = generateAllConfigs(getWorkspacePackageInfo(root));
  const keys = Array.from(configs.keys());
  assert(keys[0] !== undefined);
  assert(keys[1] !== undefined);
  expect(keys[0].endsWith('.circleci/config.yml')).toEqual(true);
  expect(
    keys[1].endsWith('apps/pollbook/backend/.circleci/config.yml')
  ).toEqual(true);

  const mainConfig = configs.get(keys[0]);
  const pbConfig = configs.get(keys[1]);
  expect(mainConfig).toBeDefined();
  expect(mainConfig).toContain('test-libs-basics');
  expect(mainConfig).toContain('test-rust-crates');
  expect(pbConfig).toContain('test-apps-pollbook-backend');

  // Screenshot publishing: per-app upload step is emitted for each
  // integration-testing job, and the singleton publish-screenshot-gallery
  // job is wired into the workflow on `main` only.
  expect(mainConfig).toContain('aws-cli: circleci/aws-cli@5');
  expect(mainConfig).toContain('publish-screenshot-gallery');
  expect(mainConfig).toContain('"s3://$SCREENSHOT_BUCKET/screenshots/admin/"');
  expect(mainConfig).toContain(
    '"s3://$SCREENSHOT_BUCKET/screenshots/mark-scan/"'
  );
  expect(mainConfig).toContain('only: drew/screenshot-management');
});
