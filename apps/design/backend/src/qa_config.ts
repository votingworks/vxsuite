import { assert, Optional } from '@votingworks/basics';

const REQUIRED_ENV_VARS = [
  'CIRCLECI_API_TOKEN',
  'CIRCLECI_PROJECT_SLUG',
  'CIRCLECI_WEBHOOK_SECRET',
] as const;

const DEFAULT_API_BASE_URL = 'https://circleci.com';

/**
 * The fields of a {@link QaConfig}.
 */
export interface QaConfigParams {
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
   * The organizations whose exports get QA'd (`CIRCLECI_QA_ORG_IDS`). Elections
   * belonging to any other organization are skipped, and their QA runs are
   * hidden from the API. Use `pnpm list-organizations` to look up IDs.
   */
  readonly organizationIds: readonly string[];

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

/**
 * Configuration for automated QA, which runs the
 * [vx-qa](https://github.com/votingworks/vx-qa) suite against an exported
 * election package by triggering a CircleCI pipeline.
 *
 * Assembled from environment variables by {@link QaConfig.fromEnv}. See the
 * backend README for the full reference and for local development recipes.
 */
export class QaConfig {
  constructor(private readonly params: QaConfigParams) {}

  get apiBaseUrl(): string {
    return this.params.apiBaseUrl;
  }

  get apiToken(): string {
    return this.params.apiToken;
  }

  get branch(): Optional<string> {
    return this.params.branch;
  }

  get organizationIds(): readonly string[] {
    return this.params.organizationIds;
  }

  get projectSlug(): string {
    return this.params.projectSlug;
  }

  get webhookSecret(): string {
    return this.params.webhookSecret;
  }

  /**
   * The automated QA configuration, or `undefined` when automated QA is turned
   * off, i.e. when none of {@link REQUIRED_ENV_VARS} are set.
   *
   * @throws if only some of {@link REQUIRED_ENV_VARS} are set. A partial
   * configuration is a deployment mistake that would otherwise silently turn
   * automated QA off.
   */
  static fromEnv(): Optional<QaConfig> {
    const apiToken = process.env.CIRCLECI_API_TOKEN;
    const projectSlug = process.env.CIRCLECI_PROJECT_SLUG;
    const webhookSecret = process.env.CIRCLECI_WEBHOOK_SECRET;

    if (!apiToken || !projectSlug || !webhookSecret) {
      const set = REQUIRED_ENV_VARS.filter((name) => process.env[name]);
      assert(
        set.length === 0,
        `Automated QA is only partially configured: ${set.join(', ')} ` +
          `${set.length === 1 ? 'is' : 'are'} set. Set all of ` +
          `${REQUIRED_ENV_VARS.join(
            ', '
          )} to enable automated QA, or none of ` +
          `them to disable it.`
      );
      return undefined;
    }

    return new QaConfig({
      apiBaseUrl: process.env.CIRCLECI_BASE_URL ?? DEFAULT_API_BASE_URL,
      apiToken,
      branch: process.env.CIRCLECI_BRANCH || undefined,
      organizationIds: (process.env.CIRCLECI_QA_ORG_IDS ?? '')
        .split(',')
        .map((organizationId) => organizationId.trim())
        .filter((organizationId) => organizationId !== ''),
      projectSlug,
      webhookSecret,
    });
  }

  /**
   * Whether automated QA is enabled for the given organization. Gates both
   * triggering QA on export and returning QA runs from the API.
   */
  isQaEnabledForOrganization(organizationId: string): boolean {
    return this.organizationIds.includes(organizationId);
  }

  /**
   * A one-line description of the automated QA configuration, logged at startup
   * so a misconfiguration doesn't quietly go unnoticed.
   */
  summary(): string {
    if (this.organizationIds.length === 0) {
      return `Automated QA: no organizations enabled, set CIRCLECI_QA_ORG_IDS (project ${this.projectSlug})`;
    }
    const branch = this.branch ?? 'default branch';
    return `Automated QA: enabled for organizations ${this.organizationIds.join(
      ', '
    )} (project ${this.projectSlug}, ${branch})`;
  }
}
