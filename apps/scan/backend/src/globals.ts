import { unsafeParse } from '@votingworks/types';
import { DEV_MOCK_USB_GLOB_PATTERN } from '@votingworks/usb-drive';
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
const DEFAULT_ALLOWED_EXPORT_PATTERNS =
  NODE_ENV === 'test'
    ? ['/tmp/**/*'] // Mock USB drive location
    : ['/media/**/*']; // Real USB drive location

if (NODE_ENV === 'development') {
  DEFAULT_ALLOWED_EXPORT_PATTERNS.push(DEV_MOCK_USB_GLOB_PATTERN);
}

export const SCAN_ALLOWED_EXPORT_PATTERNS =
  process.env.SCAN_ALLOWED_EXPORT_PATTERNS?.split(',') ??
  DEFAULT_ALLOWED_EXPORT_PATTERNS;
