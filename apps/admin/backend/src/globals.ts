import { unsafeParse } from '@votingworks/types';
import { DEV_MOCK_USB_DRIVE_GLOB_PATTERN } from '@votingworks/usb-drive';
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

/**
 * A glob pattern for USB drives (real and not dev mock)
 */
export const REAL_USB_DRIVE_GLOB_PATTERN = '/media/**/*';

const DEFAULT_ALLOWED_EXPORT_PATTERNS =
  NODE_ENV === 'production'
    ? [
        REAL_USB_DRIVE_GLOB_PATTERN,
        '/tmp/**/*', // Where data is first written for signature file creation
      ]
    : NODE_ENV === 'development'
    ? [
        REAL_USB_DRIVE_GLOB_PATTERN,
        DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
        '/tmp/**/*', // Where data is first written for signature file creation
      ]
    : ['/tmp/**/*']; // Where mock USB drives are created within tests

/**
 * Where are exported files allowed to be written to?
 */
export const ADMIN_ALLOWED_EXPORT_PATTERNS =
  process.env.ADMIN_ALLOWED_EXPORT_PATTERNS?.split(',') ??
  DEFAULT_ALLOWED_EXPORT_PATTERNS;
