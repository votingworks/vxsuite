import {
  FRONTEND_PORT,
  NODE_ENV,
  requiredProdEnvVar,
} from '@votingworks/design-backend';
import { getHubDevWorkspaceDir } from '@votingworks/utils';
import { join } from 'node:path';

/**
 * Port for the backend server.
 *
 * Using PORT here because 1) it's more idiomatic than BACKEND_PORT and
 * 2) Heroku sets PORT and expects the server to bind to that port.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.PORT || FRONTEND_PORT + 1);

// @coverage-exclude
export function authEnabled(): boolean {
  if (NODE_ENV === 'production') {
    return true;
  }

  // Support enabling in dev for testing Auth0 integration locally.
  const envVar = process.env.AUTH_ENABLED || '';
  return envVar.toLowerCase() === 'true';
}

// @coverage-exclude
export function auth0ClientId(): string {
  return requiredProdEnvVar('AUTH0_CLIENT_ID', '');
}

// @coverage-exclude
export function auth0ClientDomain(): string {
  return requiredProdEnvVar('AUTH0_CLIENT_DOMAIN', '');
}

// @coverage-exclude
export function auth0IssuerBaseUrl(): string {
  return requiredProdEnvVar('AUTH0_ISSUER_BASE_URL', '');
}

// @coverage-exclude
export function auth0Secret(): string {
  return requiredProdEnvVar('AUTH0_SECRET', '');
}

export function slackWebhookUrl(): string {
  return requiredProdEnvVar('SLACK_WEBHOOK_URL', '');
}

/**
 * Where should the database go?
 */
export const WORKSPACE =
  process.env.WORKSPACE ??
  // @coverage-defer
  (NODE_ENV === 'development'
    ? // Shared with dev tooling that reads VxHub's exports.
      getHubDevWorkspaceDir(join(import.meta.dirname, '../../../..'))
    : undefined);

export {
  DEPLOY_ENV,
  FRONTEND_PORT,
  NODE_ENV,
  baseUrl,
  databaseUrl,
  MAX_LIVE_REPORT_ACTIVITY_ITEMS,
  MAX_POSTGRES_INDEX_KEY_BYTES,
  sliOrganizationId,
  votingWorksOrganizationId,
} from '@votingworks/design-backend';
