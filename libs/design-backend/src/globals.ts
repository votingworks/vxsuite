import { assert } from '@votingworks/basics';
import { unsafeParse } from '@votingworks/types';
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
  // @coverage-defer
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

export function requiredProdEnvVar<Fallback>(
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

export function databaseUrl(): string {
  return requiredProdEnvVar(
    'DATABASE_URL',
    'postgresql://design:design@localhost:5432/design'
  );
}

// @coverage-exclude
export function baseUrl(): string {
  const herokuAppName = process.env['HEROKU_APP_NAME'];
  if (!process.env['BASE_URL'] && DEPLOY_ENV === 'staging' && herokuAppName) {
    return `https://${herokuAppName}.herokuapp.com`;
  }

  return requiredProdEnvVar('BASE_URL', `http://localhost:${FRONTEND_PORT}`);
}

export function votingWorksOrganizationId(): string {
  return requiredProdEnvVar('ORG_ID_VOTINGWORKS', 'votingworks');
}

export function sliOrganizationId(): string {
  return requiredProdEnvVar('ORG_ID_SLI', 'sli');
}

/**
 * The max Postgres index key size is 8191 bytes, so this leaves a little buffer.
 */
export const MAX_POSTGRES_INDEX_KEY_BYTES = 8000;

/**
 * Maximum number of activity log items returned in the live reports summary.
 */
export const MAX_LIVE_REPORT_ACTIVITY_ITEMS = 50;
