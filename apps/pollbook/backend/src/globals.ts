import { unsafeParse } from '@votingworks/types';
import { join } from 'node:path';
import { z } from 'zod/v4';

const NodeEnvSchema = z.union([
  z.literal('development'),
  z.literal('test'),
  z.literal('production'),
]);

/**
 * Default ports for the local and peer server.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const LOCAL_PORT = Number(process.env.LOCAL_PORT || 3002);
// eslint-disable-next-line vx/gts-safe-number-parse
export const PEER_PORT = Number(process.env.PEER_PORT || 3004);

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

export const CONFIGURATION_POLLING_INTERVAL = 100;
export const EVENT_POLLING_INTERVAL = 200;
export const NETWORK_POLLING_INTERVAL = 2000;
export const MACHINE_DISCONNECTED_TIMEOUT = 10000;
export const NETWORK_REQUEST_TIMEOUT = 1000;
export const NETWORK_GOSSIP_BRANCHING_FACTOR = 3;
export const UNCONFIGURE_LOCKOUT_TIMEOUT = 3000;

export const NETWORK_EVENT_LIMIT = 500;

export const MEGABYTE = 1024 * 1024;
export const MAX_POLLBOOK_PACKAGE_SIZE = 10 * MEGABYTE;

export const POLLBOOK_PACKAGE_ASSET_FILE_NAME = 'pollbook-package.zip';
export const POLLBOOK_PACKAGE_FILENAME_PREFIX = 'pollbook-package';
