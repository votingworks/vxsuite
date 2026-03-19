import { unsafeParse } from '@votingworks/types';
import { DEV_MOCK_USB_DRIVE_GLOB_PATTERN } from '@votingworks/usb-drive';
import { isIntegrationTest } from '@votingworks/utils';
import { join } from 'node:path';
import { z } from 'zod/v4';

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
export const PORT = Number(process.env.FRONTEND_PORT || 3000) + 1;

/**
 * Default port for the peer API (host-client communication).
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PEER_PORT = Number(process.env['PEER_PORT'] || PORT + 1);

/**
 * A glob pattern for USB drives (real and not dev mock)
 */
export const REAL_USB_DRIVE_GLOB_PATTERN = '/media/**/*';

/**  How often to poll the network for changes (in milliseconds) */
export const NETWORK_POLLING_INTERVAL_MS = 2 * 1000;

/**  Network request timeout (in milliseconds) */
export const NETWORK_REQUEST_TIMEOUT_MS = 1 * 1000;

/** How long to wait before considering a machine stale (in milliseconds) */
export const STALE_MACHINE_THRESHOLD_MS = 10 * 1000;

const DEFAULT_ALLOWED_EXPORT_PATTERNS =
  NODE_ENV === 'production'
    ? isIntegrationTest()
      ? [
          REAL_USB_DRIVE_GLOB_PATTERN,
          DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
          '/tmp/**/*', // Where data is first written for signature file creation
        ]
      : [
          REAL_USB_DRIVE_GLOB_PATTERN,
          '/tmp/**/*', // Where data is first written for signature file creation
        ]
    : NODE_ENV === 'development'
    ? [
        REAL_USB_DRIVE_GLOB_PATTERN,
        DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
        '/tmp/**/*', // Where data is first written for signature file creation
      ]
    : ['/tmp/**/*', DEV_MOCK_USB_DRIVE_GLOB_PATTERN]; // Where mock USB drives are created within tests

/**
 * Where are exported files allowed to be written to?
 */
export const ADMIN_ALLOWED_EXPORT_PATTERNS =
  process.env.ADMIN_ALLOWED_EXPORT_PATTERNS?.split(',') ??
  DEFAULT_ALLOWED_EXPORT_PATTERNS;
