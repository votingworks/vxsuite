import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  isQaEnabledForOrganization,
  qaConfig,
  qaConfigSummary,
} from './qa_config.js';

const requiredEnv = {
  CIRCLECI_API_TOKEN: 'test-token',
  CIRCLECI_PROJECT_SLUG: 'gh/test/repo',
  CIRCLECI_WEBHOOK_SECRET: 'test-secret',
} as const;

function stubEnv(env: Record<string, string>): void {
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('qaConfig', () => {
  test('is undefined when none of the required env vars are set', () => {
    expect(qaConfig()).toBeUndefined();
  });

  test('throws when only some of the required env vars are set', () => {
    stubEnv({ CIRCLECI_API_TOKEN: 'test-token' });
    expect(() => qaConfig()).toThrow(
      /partially configured: CIRCLECI_API_TOKEN is set/
    );

    stubEnv({ CIRCLECI_PROJECT_SLUG: 'gh/test/repo' });
    expect(() => qaConfig()).toThrow(
      /partially configured: CIRCLECI_API_TOKEN, CIRCLECI_PROJECT_SLUG are set/
    );
  });

  test('applies defaults for the optional env vars', () => {
    stubEnv(requiredEnv);
    expect(qaConfig()).toEqual({
      apiBaseUrl: 'https://circleci.com',
      apiToken: 'test-token',
      branch: undefined,
      organizationIds: [],
      projectSlug: 'gh/test/repo',
      webhookSecret: 'test-secret',
    });
  });

  test('reads the optional env vars', () => {
    stubEnv({
      ...requiredEnv,
      CIRCLECI_BASE_URL: 'http://localhost:9000',
      CIRCLECI_BRANCH: 'some-branch',
      CIRCLECI_QA_ORG_IDS: ' org-1 , org-2,,',
    });
    expect(qaConfig()).toMatchObject({
      apiBaseUrl: 'http://localhost:9000',
      branch: 'some-branch',
      organizationIds: ['org-1', 'org-2'],
    });
  });
});

describe('isQaEnabledForOrganization', () => {
  test('is false when automated QA is not configured', () => {
    expect(isQaEnabledForOrganization('org-1')).toEqual(false);
  });

  test('is true only for organizations in the allowlist', () => {
    stubEnv({ ...requiredEnv, CIRCLECI_QA_ORG_IDS: 'org-1,org-2' });
    expect(isQaEnabledForOrganization('org-1')).toEqual(true);
    expect(isQaEnabledForOrganization('org-3')).toEqual(false);
  });
});

describe('qaConfigSummary', () => {
  test('reports when automated QA is disabled', () => {
    expect(qaConfigSummary()).toEqual('Automated QA: disabled');
  });

  test('reports when no organizations are enabled', () => {
    stubEnv(requiredEnv);
    expect(qaConfigSummary()).toEqual(
      'Automated QA: no organizations enabled, set CIRCLECI_QA_ORG_IDS (project gh/test/repo)'
    );
  });

  test('reports the enabled organizations, project, and branch', () => {
    stubEnv({ ...requiredEnv, CIRCLECI_QA_ORG_IDS: 'org-1,org-2' });
    expect(qaConfigSummary()).toEqual(
      'Automated QA: enabled for organizations org-1, org-2 (project gh/test/repo, default branch)'
    );

    stubEnv({ CIRCLECI_BRANCH: 'some-branch' });
    expect(qaConfigSummary()).toEqual(
      'Automated QA: enabled for organizations org-1, org-2 (project gh/test/repo, some-branch)'
    );
  });
});
