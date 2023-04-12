/* istanbul ignore file */

import { unsafeParse } from '@votingworks/types';
import { join } from 'path';
import { z } from 'zod';

const NodeEnvSchema = z.union([
  z.literal('development'),
  z.literal('test'),
  z.literal('production'),
]);

/**
 * Which node environment is this?
 */
export const NODE_ENV = unsafeParse(
  NodeEnvSchema,
  process.env.NODE_ENV ?? 'development'
);

/**
 * Path for the database file and other files
 */
export const ADMIN_WORKSPACE =
  process.env.ADMIN_WORKSPACE ??
  (NODE_ENV === 'development'
    ? join(__dirname, '../dev-workspace')
    : undefined);

/**
 * Default port for the admin API.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.PORT || 3004);
