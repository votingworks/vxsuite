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
  // integration-testing job under a per-version prefix, and the
  // publish-screenshot-gallery job is wired into the workflow on `main` and on
  // release tags.
  expect(mainConfig).toContain('aws-cli: circleci/aws-cli@5');
  expect(mainConfig).toContain('publish-screenshot-gallery');
  expect(mainConfig).toContain(
    '"s3://$SCREENSHOT_BUCKET/screenshots/$VERSION/admin/"'
  );
  expect(mainConfig).toContain(
    '"s3://$SCREENSHOT_BUCKET/screenshots/$VERSION/mark-scan/"'
  );
  expect(mainConfig).toContain('only: main');
  // Release tags trigger the integration jobs and the gallery job (and the
  // require-chain demands the tag filter appear on the required jobs too).
  expect(mainConfig).toContain('only: /^v[0-9]+\\.[0-9]+\\.[0-9]+$/');
});
