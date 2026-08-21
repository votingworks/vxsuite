import { assert, Optional } from '@votingworks/basics';

/**
 * Configuration for automated QA, which runs the
 * [vx-qa](https://github.com/votingworks/vx-qa) suite against an exported
 * election package by triggering a CircleCI pipeline.
 *
 * Assembled from environment variables by {@link qaConfig}. See the backend
 * README for the full reference and for local development recipes.
 */
export interface QaConfig {
  /**
   * CircleCI API root, pointed at a stand-in server when testing locally
   * (`CIRCLECI_BASE_URL`).
   */
  readonly apiBaseUrl: string;

  /** CircleCI API token authorizing pipeline triggers (`CIRCLECI_API_TOKEN`). */
  readonly apiToken: string;

  /**
   * The vx-qa branch to run, or `undefined` to run the project's default branch
   * (`CIRCLECI_BRANCH`).
   */
  readonly branch?: string;

  /**
   * The vx-qa CircleCI project, e.g. `gh/votingworks/vx-qa-internal`
   * (`CIRCLECI_PROJECT_SLUG`).
   */
  readonly projectSlug: string;

  /**
   * Shared secret CircleCI presents when calling back with status updates
   * (`CIRCLECI_WEBHOOK_SECRET`).
   */
  readonly webhookSecret: string;
}

const REQUIRED_ENV_VARS = [
  'CIRCLECI_API_TOKEN',
  'CIRCLECI_PROJECT_SLUG',
  'CIRCLECI_WEBHOOK_SECRET',
] as const;

const DEFAULT_API_BASE_URL = 'https://circleci.com';

/**
 * The automated QA configuration, or `undefined` when automated QA is turned
 * off, i.e. when none of {@link REQUIRED_ENV_VARS} are set.
 *
 * @throws if only some of {@link REQUIRED_ENV_VARS} are set. A partial
 * configuration is a deployment mistake that would otherwise silently turn
 * automated QA off.
 */
export function qaConfig(): Optional<QaConfig> {
  const apiToken = process.env.CIRCLECI_API_TOKEN;
  const projectSlug = process.env.CIRCLECI_PROJECT_SLUG;
  const webhookSecret = process.env.CIRCLECI_WEBHOOK_SECRET;

  if (!apiToken || !projectSlug || !webhookSecret) {
    const set = REQUIRED_ENV_VARS.filter((name) => process.env[name]);
    assert(
      set.length === 0,
      `Automated QA is only partially configured: ${set.join(', ')} ` +
        `${set.length === 1 ? 'is' : 'are'} set. Set all of ` +
        `${REQUIRED_ENV_VARS.join(', ')} to enable automated QA, or none of ` +
        `them to disable it.`
    );
    return undefined;
  }

  return {
    apiBaseUrl: process.env.CIRCLECI_BASE_URL ?? DEFAULT_API_BASE_URL,
    apiToken,
    branch: process.env.CIRCLECI_BRANCH || undefined,
    projectSlug,
    webhookSecret,
  };
}

/**
 * A one-line description of the automated QA configuration, logged at startup
 * so a misconfiguration doesn't quietly go unnoticed.
 */
export function qaConfigSummary(): string {
  const config = qaConfig();
  if (!config) {
    return 'Automated QA: disabled';
  }
  const branch = config.branch ?? 'default branch';
  return `Automated QA: enabled (project ${config.projectSlug}, ${branch})`;
}
