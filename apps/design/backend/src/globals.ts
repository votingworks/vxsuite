import { assert } from '@votingworks/basics';
import { unsafeParse } from '@votingworks/types';
import { join } from 'node:path';
import { z } from 'zod/v4';

const NodeEnvSchema = z.union([
  z.literal('development'),
  z.literal('test'),
  z.literal('production'),
]);

/**
 * Which node environment is this? In any deployment, this should always be set
 * to 'production'.
 */
export const NODE_ENV = unsafeParse(
  NodeEnvSchema,
  process.env.NODE_ENV ?? 'development'
);

const DeployEnvSchema = z.union([
  z.literal('development'),
  z.literal('staging'),
  z.literal('production'),
]);

/**
 * Which deployment environment is this (production, staging, development)?
 */
export const DEPLOY_ENV = unsafeParse(
  DeployEnvSchema,
  process.env.DEPLOY_ENV ?? 'development'
);

/**
 * Port for the frontend server.
 * 
 * Note that in development we run two servers, one for the frontend and one for
 * the backend. This controls the port of the frontend.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 3000);

/**
 * Port for the backend server.
 *
 * Using PORT here because 1) it's more idiomatic than BACKEND_PORT and
 * 2) Heroku sets PORT and expects the server to bind to that port.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.PORT || (FRONTEND_PORT + 1));

/* istanbul ignore next - @preserve */
function requiredProdEnvVar<Fallback>(
  name: string,
  devFallback: Fallback
): string | Fallback {
  const envVar = process.env[name];
  if (envVar) {
    return envVar;
  }

  assert(NODE_ENV !== 'production', `Env var ${name} required in production.`);

  return devFallback;
}

/* istanbul ignore next - @preserve */
export function databaseUrl(): string {
  return requiredProdEnvVar(
    'DATABASE_URL',
    'postgresql://design:design@localhost:5432/design'
  );
}

/* istanbul ignore next - @preserve */
export function authEnabled(): boolean {
  if (NODE_ENV === 'production') {
    return true;
  }

  // Support enabling in dev for testing Auth0 integration locally.
  const envVar = process.env.AUTH_ENABLED || '';
  return envVar.toLowerCase() === 'true';
}

/* istanbul ignore next - @preserve */
export function baseUrl(): string {
  // Special case to support Heroku review apps
  const herokuAppName = process.env['HEROKU_APP_NAME'];
  if (!process.env['BASE_URL'] && DEPLOY_ENV === 'staging' && herokuAppName) {
    return `https://${herokuAppName}.herokuapp.com`;
  }

  return requiredProdEnvVar('BASE_URL', `http://localhost:${FRONTEND_PORT}`);
}

/* istanbul ignore next - @preserve */
export function auth0ClientId(): string {
  return requiredProdEnvVar('AUTH0_CLIENT_ID', '');
}

/* istanbul ignore next - @preserve */
export function auth0ClientDomain(): string {
  return requiredProdEnvVar('AUTH0_CLIENT_DOMAIN', '');
}

/* istanbul ignore next - @preserve */
export function auth0IssuerBaseUrl(): string {
  return requiredProdEnvVar('AUTH0_ISSUER_BASE_URL', '');
}

/* istanbul ignore next - @preserve */
export function auth0Secret(): string {
  return requiredProdEnvVar('AUTH0_SECRET', '');
}

export function slackWebhookUrl(): string {
  return requiredProdEnvVar('SLACK_WEBHOOK_URL', '');
}

export function votingWorksOrganizationId(): string {
  return requiredProdEnvVar('ORG_ID_VOTINGWORKS', 'votingworks');
}

export function sliOrganizationId(): string {
  return requiredProdEnvVar('ORG_ID_SLI', 'sli');
}

/**
 * CircleCI API token for triggering QA builds.
 * Optional - if not set, QA builds will not be triggered.
 */
export function circleCiApiToken(): string | undefined {
  return process.env.CIRCLECI_API_TOKEN;
}

/**
 * CircleCI project slug (e.g., "gh/organization/repository").
 * Required if CircleCI integration is enabled.
 */
export function circleCiProjectSlug(): string | undefined {
  return process.env.CIRCLECI_PROJECT_SLUG;
}

/**
 * Shared secret for authenticating CircleCI webhook callbacks.
 * Required if CircleCI integration is enabled.
 */
export function circleCiWebhookSecret(): string | undefined {
  return process.env.CIRCLECI_WEBHOOK_SECRET;
}

/**
 * Whether CircleCI integration is enabled (has required config).
 */
export function isCircleCiEnabled(): boolean {
  return !!(
    circleCiApiToken() &&
    circleCiProjectSlug() &&
    circleCiWebhookSecret()
  );
}

/**
 * CircleCI branch to trigger pipelines on.
 * Optional - if not set, CircleCI uses the project's default branch.
 */
export function circleCiBranch(): string | undefined {
  return process.env.CIRCLECI_BRANCH || undefined;
}

/**
 * CircleCI API base URL (for testing with mock servers).
 * Defaults to https://circleci.com
 */
export function circleCiBaseUrl(): string {
  return process.env.CIRCLECI_BASE_URL ?? 'https://circleci.com';
}

/**
 * Where should the database go?
 */
export const WORKSPACE =
  process.env.WORKSPACE ??
  (NODE_ENV === 'development'
    ? join(__dirname, '../dev-workspace')
    : undefined);

/**
 * The max Postgres index key size is 8191 bytes, so this leaves a little buffer.
 */
export const MAX_POSTGRES_INDEX_KEY_BYTES = 8000;
