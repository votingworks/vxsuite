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

  // The experimental moon jobs are added to the full config as non-blocking
  // additions: moon-ci + one e2e job per app (incl. mark-scan, which gets a
  // `make build` step for its hardware daemons).
  expect(mainConfig).toContain('moon-ci:');
  expect(mainConfig).toContain('moon-e2e-mark-scan:');
  expect(mainConfig).toContain(
    'make -C apps/mark-scan/integration-testing build'
  );
  expect(mainConfig).toContain('moon run admin-integration-testing:test');

  // The moon jobs are experiment-only: each workflow entry carries a branch
  // filter so they run only on branches whose name contains "moon".
  expect(mainConfig).toContain(
    '      - moon-ci:\n' +
      '          context:\n' +
      '            - screenshots-publishing\n' +
      '          filters:\n' +
      '            branches:\n' +
      '              only: /.*moon.*/'
  );
  expect(mainConfig).toContain(
    '      - moon-e2e-admin:\n' +
      '          context:\n' +
      '            - screenshots-publishing\n' +
      '          filters:\n' +
      '            branches:\n' +
      '              only: /.*moon.*/'
  );

  // moon is installed only if it isn't already on PATH (so a future image/proto
  // install makes this a no-op).
  expect(mainConfig).toContain('if command -v moon >/dev/null 2>&1; then');
  expect(mainConfig).toContain('moonrepo.dev/install/moon.sh');
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
  // Required check: sharded moon ci (spreads load across containers) with test
  // results collected.
  expect(config).toContain('moon-ci:');
  expect(config).toContain('parallelism: 3');
  expect(config).toContain(
    'moon ci --job "$CIRCLE_NODE_INDEX" --job-total "$CIRCLE_NODE_TOTAL" --downstream none'
  );
  expect(config).toContain('moonrepo.dev/install/moon.sh');
  expect(config).toContain('store_test_results:');
  // The measurement-only baseline job is gone now that we've chosen
  // single-container.
  expect(config).not.toContain('moon-ci-baseline:');
  // Non-required e2e lane: one job per app, each installing Chromium and running
  // its Playwright suite via `moon run` (runInCI:false so `moon ci` skips it).
  expect(config).toContain('playwright install chromium');
  expect(config).toContain('moon-e2e-admin:');
  expect(config).toContain('moon-e2e-central-scan:');
  expect(config).toContain('moon-e2e-print:');
  expect(config).toContain('moon run admin-integration-testing:test');
  expect(config).toContain('moon run print-integration-testing:test');
  // The prototype workflow also filters to moon-named branches.
  expect(config).toContain('only: /.*moon.*/');
  // ...and none of the per-package / rust jobs.
  expect(config).not.toContain('test-libs-basics');
  expect(config).not.toContain('test-rust-crates');
});
