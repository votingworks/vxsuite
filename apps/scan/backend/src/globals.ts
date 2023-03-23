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

export const CVR_EXPORT_FORMAT = process.env.CVR_EXPORT_FORMAT ?? 'vxf';

/**
 * Determines whether to the use next generation NH ballot interpreter.
 */
export const USE_NH_NEXT =
  process.env.USE_NH_NEXT === '1' || process.env.USE_NH_NEXT === 'true';

const ScannerModelSchema = z.union([z.literal('custom'), z.literal('plustek')]);

/**
 * Scanner models we support.
 */
export type ScannerModel = z.infer<typeof ScannerModelSchema>;

/**
 * Which scanner model is the default?
 */
export const DEFAULT_SCANNER_MODEL: ScannerModel = 'custom';

/**
 * Which scanner model are we using?
 */
export const SCANNER_MODEL = unsafeParse(
  ScannerModelSchema,
  process.env.SCANNER_MODEL ?? DEFAULT_SCANNER_MODEL
);
