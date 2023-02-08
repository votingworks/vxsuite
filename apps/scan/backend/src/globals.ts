import { unsafeParse } from '@votingworks/types';
import { join } from 'path';
import { z } from 'zod';

const NodeEnvSchema = z.union([
  z.literal('development'),
  z.literal('test'),
  z.literal('production'),
]);

/**
 * Default port for the scan API.
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

/**
 * Where should the database and image files etc go?
 */
export const SCAN_WORKSPACE =
  process.env.SCAN_WORKSPACE ??
  (NODE_ENV === 'development'
    ? join(__dirname, '../dev-workspace')
    : undefined);

/**
 * Where are exported files allowed to be written to?
 */
const defaultAllowedExportPatterns =
  NODE_ENV === 'test'
    ? ['/tmp/**/*'] // Mock USB drive location
    : ['/media/**/*']; // Real USB drive location
export const SCAN_ALLOWED_EXPORT_PATTERNS =
  process.env.SCAN_ALLOWED_EXPORT_PATTERNS?.split(',') ??
  defaultAllowedExportPatterns;

/**
 * Path to the `plustekctl` binary.
 */
export const { PLUSTEKCTL_PATH } = process.env;
