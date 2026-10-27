import { expect, test } from 'vitest';
import { join } from 'node:path';
import { assertDefined } from '@votingworks/basics';
import {
  CIRCLECI_CONFIG_PATH,
  CIRCLECI_CONTINUE_CONFIG_PATH,
  CIRCLECI_JOB_SELECTION_PATH,
  type JobSelection,
  generateAllConfigs,
} from './circleci.js';
import { getWorkspacePackageInfo } from './pnpm.js';

const root = join(import.meta.dirname, '../../..');
const configs = generateAllConfigs(getWorkspacePackageInfo(root));
const setupConfig = assertDefined(configs.get(CIRCLECI_CONFIG_PATH));
const continueConfig = assertDefined(
  configs.get(CIRCLECI_CONTINUE_CONFIG_PATH)
);
const jobSelection = JSON.parse(
  assertDefined(configs.get(CIRCLECI_JOB_SELECTION_PATH))
) as JobSelection;

test('setup config only selects jobs', () => {
  expect([...configs.keys()]).toEqual([
    CIRCLECI_CONFIG_PATH,
    CIRCLECI_CONTINUE_CONFIG_PATH,
    CIRCLECI_JOB_SELECTION_PATH,
  ]);
  expect(setupConfig).toContain('setup: true');
  expect(setupConfig).toContain('script/ci-select-jobs');
  expect(setupConfig).not.toContain('test-libs-basics');
});

test('continue config defines every job but no workflows', () => {
  expect(continueConfig).toContain('test-libs-basics:');
  expect(continueConfig).toContain('test-rust-crates:');
  expect(continueConfig).toContain('test-apps-pollbook-backend:');
  expect(continueConfig).not.toContain('workflows:');

  // Screenshot publishing: per-app upload step is emitted for each
  // integration-testing job, and the notify-gallery job (which triggers the
  // GitHub Actions gallery build) is wired into the workflow on `main` only.
  expect(continueConfig).toContain('aws-cli: circleci/aws-cli@5');
  expect(continueConfig).toContain('notify-gallery:');
  expect(continueConfig).toContain('build-screenshot-gallery');
  expect(continueConfig).toContain(
    '"s3://$SCREENSHOT_BUCKET/screenshots/admin/"'
  );
  expect(continueConfig).toContain(
    '"s3://$SCREENSHOT_BUCKET/screenshots/mark-scan/"'
  );
});

test('job selection maps packages to the jobs they affect', () => {
  const { packages } = jobSelection;
  expect(packages['libs/basics']).toContain('test-libs-basics');
  expect(packages['libs/basics']).toContain('test-apps-admin-backend');
  expect(packages['libs/networking']).not.toContain('test-libs-basics');
  expect(packages['apps/admin/frontend']).toEqual([
    'test-apps-admin-frontend',
    'test-apps-admin-integration-testing',
  ]);
  expect(packages['script']).toBeUndefined();

  expect(packages['apps/pollbook/backend']).toContain(
    'test-apps-pollbook-backend'
  );
  expect(packages['libs/basics']).not.toContain('test-apps-pollbook-backend');
  expect(jobSelection.allJobs).not.toContain('test-apps-pollbook-backend');
  expect(jobSelection.allJobs).toContain('test-rust-crates');

  expect(jobSelection.galleryRequires).toContain(
    'test-apps-admin-integration-testing'
  );
  expect(jobSelection.galleryRequires).not.toContain(
    'test-apps-admin-frontend'
  );
});
