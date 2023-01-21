import { unsafeParse } from '@votingworks/types';
import { z } from 'zod';

const NodeEnvSchema = z.union([
  z.literal('development'),
  z.literal('test'),
  z.literal('production'),
]);

/**
 * Default port for the VxMark API.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.PORT || 3002);

/**
 * What's the unique ID for this machine?
 */
export const VX_MACHINE_ID = process.env.VX_MACHINE_ID ?? '000';

/**
 * Which node environment is this?
 */
export const NODE_ENV = unsafeParse(
  NodeEnvSchema,
  process.env.NODE_ENV ?? 'development'
);
