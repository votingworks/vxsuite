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
  // integration-testing job, and the notify-gallery job (which triggers the
  // GitHub Actions gallery build) is wired into the workflow on `main` only.
  expect(mainConfig).toContain('aws-cli: circleci/aws-cli@5');
  expect(mainConfig).toContain('notify-gallery');
  expect(mainConfig).toContain('build-screenshot-gallery');
  expect(mainConfig).not.toContain('thumbsup');
  expect(mainConfig).toContain('"s3://$SCREENSHOT_BUCKET/screenshots/admin/"');
  expect(mainConfig).toContain(
    '"s3://$SCREENSHOT_BUCKET/screenshots/mark-scan/"'
  );
  expect(mainConfig).toContain('only: main');
});

test('generateAllConfigs moon prototype mode', () => {
  const root = join(__dirname, '../../..');
  const configs = generateAllConfigs(getWorkspacePackageInfo(root), {
    moonPrototype: true,
  });

  // Only the single top-level config is emitted (no per-app filtered configs).
  const keys = Array.from(configs.keys());
  expect(keys).toHaveLength(1);
  assert(keys[0] !== undefined);
  expect(keys[0].endsWith('.circleci/config.yml')).toEqual(true);

  const config = configs.get(keys[0]);
  assert(config !== undefined);
  // Runs the experimental moon job, sharded across containers...
  expect(config).toContain('moon-ci:');
  expect(config).toContain('parallelism: 3');
  expect(config).toContain(
    'moon ci --job "$CIRCLE_NODE_INDEX" --job-total "$CIRCLE_NODE_TOTAL" --downstream none'
  );
  expect(config).toContain('moonrepo.dev/install/moon.sh');
  // Single-container cold baseline job for comparison: remote cache disabled,
  // no --job sharding, and test results collected.
  expect(config).toContain('moon-ci-baseline:');
  expect(config).toContain('unset MOON_REMOTE_HOST');
  expect(config).toContain('moon ci --downstream none --summary');
  expect(config).toContain('store_test_results:');
  // Non-required e2e lane: runs the Playwright suite via `moon run` (it's
  // runInCI:false so `moon ci` skips it) after installing Chromium.
  expect(config).toContain('moon-e2e:');
  expect(config).toContain('playwright install chromium');
  expect(config).toContain(
    'moon run admin-integration-testing:test central-scan-integration-testing:test mark-integration-testing:test'
  );
  // ...and none of the per-package / rust jobs.
  expect(config).not.toContain('test-libs-basics');
  expect(config).not.toContain('test-rust-crates');
});
