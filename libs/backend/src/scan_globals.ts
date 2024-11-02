import { DEV_MACHINE_ID, unsafeParse } from '@votingworks/types';
import { DEV_MOCK_USB_DRIVE_GLOB_PATTERN } from '@votingworks/usb-drive';
import { z } from 'zod';

const NodeEnvSchema = z.union([
  z.literal('development'),
  z.literal('test'),
  z.literal('production'),
]);

/**
 * What's the unique ID for this machine?
 */
export const VX_MACHINE_ID = process.env.VX_MACHINE_ID ?? DEV_MACHINE_ID;

/**
 * Which node environment is this?
 */
export const NODE_ENV = unsafeParse(
  NodeEnvSchema,
  process.env.NODE_ENV ?? 'development'
);

const REAL_USB_DRIVE_GLOB_PATTERN = '/media/**/*';

const DEFAULT_ALLOWED_EXPORT_PATTERNS =
  NODE_ENV === 'production'
    ? [REAL_USB_DRIVE_GLOB_PATTERN]
    : NODE_ENV === 'development'
    ? [REAL_USB_DRIVE_GLOB_PATTERN, DEV_MOCK_USB_DRIVE_GLOB_PATTERN]
    : ['/tmp/**/*']; // Where mock USB drives are created within tests

/**
 * Where are exported files allowed to be written to?
 */
export const SCAN_ALLOWED_EXPORT_PATTERNS =
  process.env.SCAN_ALLOWED_EXPORT_PATTERNS?.split(',') ??
  DEFAULT_ALLOWED_EXPORT_PATTERNS;
