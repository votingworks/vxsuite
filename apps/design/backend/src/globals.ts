import { assert } from '@votingworks/basics';
import { unsafeParse } from '@votingworks/types';
import { join } from 'node:path';
import { z } from 'zod';

const NodeEnvSchema = z.union([
  z.literal('development'),
  z.literal('test'),
  z.literal('production'),
]);

/**
 * Default port for the server.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.PORT || 3002);

/**
 * Which node environment is this?
 */
export const NODE_ENV = unsafeParse(
  NodeEnvSchema,
  process.env.NODE_ENV ?? 'development'
);

function requiredProdEnvVar<Fallback extends string | undefined = undefined>(
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

/** */
export function baseUrl(): string {
  return requiredProdEnvVar('BASE_URL', `http://localhost:${PORT}`);
}

/** */
export function auth0ClientId(): string | undefined {
  return requiredProdEnvVar('AUTH0_CLIENT_ID', undefined);
}

/** */
export function auth0IssuerBaseUrl(): string | undefined {
  return requiredProdEnvVar('AUTH0_ISSUER_BASE_URL', undefined);
}

/** */
export function auth0Secret(): string | undefined {
  return requiredProdEnvVar('AUTH0_SECRET', undefined);
}

/**
 * Where should the database go?
 */
export const WORKSPACE =
  process.env.WORKSPACE ??
  (NODE_ENV === 'development'
    ? join(__dirname, '../dev-workspace')
    : undefined);
