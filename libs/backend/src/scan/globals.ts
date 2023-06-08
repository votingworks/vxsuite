import { unsafeParse } from '@votingworks/types';
import { z } from 'zod';

const NodeEnvSchema = z.union([
  z.literal('development'),
  z.literal('test'),
  z.literal('production'),
]);

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
 * Where are exported files allowed to be written to by default?
 */
const defaultAllowedExportPatterns =
  NODE_ENV === 'test'
    ? [
        '/tmp/**/*', // Mock USB drive location
      ]
    : [
        '/media/**/*', // Real USB drive location
        '/tmp/**/*', // Where data is first written for signature file creation
      ];

/**
 * Where are exported files allowed to be written to?
 */
export const SCAN_ALLOWED_EXPORT_PATTERNS =
  process.env.SCAN_ALLOWED_EXPORT_PATTERNS?.split(',') ??
  defaultAllowedExportPatterns;
