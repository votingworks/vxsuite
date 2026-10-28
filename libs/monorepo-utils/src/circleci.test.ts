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
  expect(continueConfig).toContain('ci-passed:');
  expect(jobSelection.passedJob).toEqual('ci-passed');

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

test('job selection maps package directories to their test jobs', () => {
  const { packageJobs } = jobSelection;
  expect(packageJobs['libs/basics']).toEqual('test-libs-basics');
  expect(packageJobs['apps/pollbook/backend']).toEqual(
    'test-apps-pollbook-backend'
  );
  expect(packageJobs['script']).toBeUndefined();
  expect(jobSelection.rustJob).toEqual('test-rust-crates');
  expect('libs/types-rs/src/election.rs').toMatch(
    new RegExp(jobSelection.rustPattern)
  );
  expect('Cargo.lock').toMatch(new RegExp(jobSelection.rustPattern));
  expect('libs/types/src/election.ts').not.toMatch(
    new RegExp(jobSelection.rustPattern)
  );

  expect(jobSelection.galleryRequires).toContain(
    'test-apps-admin-integration-testing'
  );
  expect(jobSelection.galleryRequires).not.toContain(
    'test-apps-admin-frontend'
  );
});
