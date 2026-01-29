import { unsafeParse } from '@votingworks/types';
import { DEV_MOCK_USB_DRIVE_GLOB_PATTERN } from '@votingworks/usb-drive';
import { z } from 'zod/v4';

/**
 * Default port for the server.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.PORT || 3000) + 1;
export const WORKSPACE = process.env.PRINT_WORKSPACE || 'dev-workspace';

const NodeEnvSchema = z.union([
  z.literal('development'),
  z.literal('test'),
  z.literal('production'),
]);

const NODE_ENV = unsafeParse(
  NodeEnvSchema,
  process.env['NODE_ENV'] ?? 'development'
);

const REAL_USB_DRIVE_GLOB_PATTERN = '/media/**/*';

export const PRINT_ALLOWED_EXPORT_PATTERNS =
  NODE_ENV === 'production'
    ? [REAL_USB_DRIVE_GLOB_PATTERN, '/tmp/**/*']
    : NODE_ENV === 'development'
    ? [
        REAL_USB_DRIVE_GLOB_PATTERN,
        DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
        '/tmp/**/*',
      ]
    : ['/tmp/**/*'];
