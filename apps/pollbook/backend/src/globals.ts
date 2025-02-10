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

/**
 * Where should the database go?
 */
export const WORKSPACE =
  process.env.WORKSPACE ??
  (NODE_ENV === 'development'
    ? join(__dirname, '../dev-workspace')
    : undefined);

export const NETWORK_POLLING_INTERVAL = 5000;
export const MACHINE_DISCONNECTED_TIMEOUT = 10000;
export const NETWORK_REQUEST_TIMEOUT = 1000;

export const NETWORK_EVENT_LIMIT = 500;

export const MEGABYTE = 1024 * 1024;
export const MAX_POLLBOOK_PACKAGE_SIZE = 10 * MEGABYTE;
