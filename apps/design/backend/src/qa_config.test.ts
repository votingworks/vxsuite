import { afterEach, describe, expect, test, vi } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { QaConfig } from './qa_config.js';

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

describe('QaConfig.fromEnv', () => {
  test('is undefined when none of the required env vars are set', () => {
    expect(QaConfig.fromEnv()).toBeUndefined();
  });

  test('throws when only some of the required env vars are set', () => {
    stubEnv({ CIRCLECI_API_TOKEN: 'test-token' });
    expect(() => QaConfig.fromEnv()).toThrow(
      /partially configured: CIRCLECI_API_TOKEN is set/
    );

    stubEnv({ CIRCLECI_PROJECT_SLUG: 'gh/test/repo' });
    expect(() => QaConfig.fromEnv()).toThrow(
      /partially configured: CIRCLECI_API_TOKEN, CIRCLECI_PROJECT_SLUG are set/
    );
  });

  test('applies defaults for the optional env vars', () => {
    stubEnv(requiredEnv);
    expect(QaConfig.fromEnv()).toEqual(
      new QaConfig({
        apiBaseUrl: 'https://circleci.com',
        apiToken: 'test-token',
        branch: undefined,
        organizationIds: [],
        projectSlug: 'gh/test/repo',
        webhookSecret: 'test-secret',
      })
    );
  });

  test('reads the optional env vars', () => {
    stubEnv({
      ...requiredEnv,
      CIRCLECI_BASE_URL: 'http://localhost:9000',
      CIRCLECI_BRANCH: 'some-branch',
      CIRCLECI_QA_ORG_IDS: ' org-1 , org-2,,',
    });
    const config = assertDefined(QaConfig.fromEnv());
    expect(config.apiBaseUrl).toEqual('http://localhost:9000');
    expect(config.branch).toEqual('some-branch');
    expect(config.organizationIds).toEqual(['org-1', 'org-2']);
  });
});

describe('QaConfig.isQaEnabledForOrganization', () => {
  test('is true only for organizations in the allowlist', () => {
    stubEnv({ ...requiredEnv, CIRCLECI_QA_ORG_IDS: 'org-1,org-2' });
    const config = assertDefined(QaConfig.fromEnv());
    expect(config.isQaEnabledForOrganization('org-1')).toEqual(true);
    expect(config.isQaEnabledForOrganization('org-3')).toEqual(false);
  });
});

describe('QaConfig.summary', () => {
  test('reports when no organizations are enabled', () => {
    stubEnv(requiredEnv);
    expect(assertDefined(QaConfig.fromEnv()).summary()).toEqual(
      'Automated QA: no organizations enabled, set CIRCLECI_QA_ORG_IDS (project gh/test/repo)'
    );
  });

  test('reports the enabled organizations, project, and branch', () => {
    stubEnv({ ...requiredEnv, CIRCLECI_QA_ORG_IDS: 'org-1,org-2' });
    expect(assertDefined(QaConfig.fromEnv()).summary()).toEqual(
      'Automated QA: enabled for organizations org-1, org-2 (project gh/test/repo, default branch)'
    );

    stubEnv({ CIRCLECI_BRANCH: 'some-branch' });
    expect(assertDefined(QaConfig.fromEnv()).summary()).toEqual(
      'Automated QA: enabled for organizations org-1, org-2 (project gh/test/repo, some-branch)'
    );
  });
});
