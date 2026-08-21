import { afterEach, describe, expect, test, vi } from 'vitest';
import { qaConfig, qaConfigSummary } from './qa_config.js';

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
      projectSlug: 'gh/test/repo',
      webhookSecret: 'test-secret',
    });
  });

  test('reads the optional env vars', () => {
    stubEnv({
      ...requiredEnv,
      CIRCLECI_BASE_URL: 'http://localhost:9000',
      CIRCLECI_BRANCH: 'some-branch',
    });
    expect(qaConfig()).toMatchObject({
      apiBaseUrl: 'http://localhost:9000',
      branch: 'some-branch',
    });
  });
});

describe('qaConfigSummary', () => {
  test('reports when automated QA is disabled', () => {
    expect(qaConfigSummary()).toEqual('Automated QA: disabled');
  });

  test('reports the project and branch when enabled', () => {
    stubEnv(requiredEnv);
    expect(qaConfigSummary()).toEqual(
      'Automated QA: enabled (project gh/test/repo, default branch)'
    );

    stubEnv({ CIRCLECI_BRANCH: 'some-branch' });
    expect(qaConfigSummary()).toEqual(
      'Automated QA: enabled (project gh/test/repo, some-branch)'
    );
  });
});
