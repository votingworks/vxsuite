/* istanbul ignore file - @preserve */
import { unsafeParse } from '@votingworks/types';
import { join } from 'node:path';
import { z } from 'zod/v4';

/**
 * Default port for the VxMark API.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.FRONTEND_PORT || 3000) + 1;

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
 * Where should the database and audio files go?
 */
export const MARK_WORKSPACE =
  process.env.MARK_WORKSPACE ??
  (NODE_ENV === 'development'
    ? join(__dirname, '../dev-workspace')
    : undefined);
