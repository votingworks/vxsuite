import { assert } from '@votingworks/basics';
import { unsafeParse } from '@votingworks/types';
import { join } from 'node:path';
import { z } from 'zod/v4';

/**
 * Default port for the server.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.PORT || 3002);

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

  return requiredProdEnvVar('BASE_URL', `http://localhost:3000`);
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

export function votingWorksOrgId(): string {
  return requiredProdEnvVar('ORG_ID_VOTINGWORKS', 'votingworks');
}

export function sliOrgId(): string {
  return requiredProdEnvVar('ORG_ID_SLI', 'sli');
}

export function vxDemosOrgId(): string {
  return requiredProdEnvVar('ORG_ID_VX_DEMOS', 'vx-demos');
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
