import { unsafeParse } from '@votingworks/types';
import { join } from 'node:path';
import { z } from 'zod/v4';

const NodeEnvSchema = z.union([
  z.literal('development'),
  z.literal('test'),
  z.literal('production'),
]);

/**
 * Default port for the scan API.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.FRONTEND_PORT || 3000) + 1;

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
 * How often to poll the network for a VxAdmin host.
 */
export const NETWORK_POLLING_INTERVAL_MS = 2000;

/**
 * Timeout for requests to a VxAdmin host's peer API.
 */
export const NETWORK_REQUEST_TIMEOUT_MS = 3000;

/**
 * How often the background sync checks for saved batches that haven't been
 * sent to a VxAdmin host yet.
 */
export const CVR_SYNC_INTERVAL_MS = 2000;

/**
 * How long the background sync waits after a failed send before automatically
 * retrying, so a persistent failure doesn't hammer the host with new transfer
 * sessions every polling tick.
 */
export const CVR_SYNC_RETRY_BACKOFF_MS = 15_000;

/**
 * Timeout for uploading a single cast vote record to a VxAdmin host. Generous
 * relative to {@link NETWORK_REQUEST_TIMEOUT_MS} since uploads carry ballot
 * images. Without a timeout, a hung connection would stall the sync loop
 * indefinitely.
 */
export const CVR_UPLOAD_TIMEOUT_MS = 30_000;

/**
 * Dev override for the VxAdmin host peer API address, e.g.
 * `http://192.168.1.10:3002`. When set, avahi discovery is skipped and the
 * scanner connects to this address directly.
 */
export const ADMIN_HOST_ADDRESS_OVERRIDE =
  process.env.VX_CENTRAL_SCAN_ADMIN_HOST;

/**
 * Dev-dock mock scanner: load each sheet into the tray this many times, to
 * simulate scanning a larger stack (a longer scanning window). Defaults to 1.
 */
export const MOCK_SCANNER_SHEET_COPIES = process.env.MOCK_SCANNER_SHEET_COPIES
  ? unsafeParse(
      z.coerce.number().int().positive(),
      process.env.MOCK_SCANNER_SHEET_COPIES
    )
  : 1;
