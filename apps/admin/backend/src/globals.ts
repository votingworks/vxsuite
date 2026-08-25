import { getAllowedExportPatterns } from '@votingworks/backend';

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

/** How long to wait before considering a machine stale (in milliseconds) */
export const STALE_MACHINE_THRESHOLD_MS = 10 * 1000;

/**
 * How long `waitForUsbDriveChange` blocks before returning with an unchanged
 * sequence. Nothing in the request stack imposes a timeout — the backend's
 * Node.js idle socket timeout is explicitly disabled (see `server.ts`), the
 * proxy layers set none, and the Grout client sends no request timeout — so
 * this application-level bound is the sole mechanism that recycles the
 * held-open long-poll connection and lets a vanished client be noticed on its
 * next poll, rather than lingering indefinitely.
 */
export const USB_DRIVE_CHANGE_LONG_POLL_TIMEOUT_MS = 30 * 1000;

/**
 * Where are exported files allowed to be written to?
 */
export function getAdminAllowedExportPatterns(): string[] {
  return (
    process.env.ADMIN_ALLOWED_EXPORT_PATTERNS?.split(',') ??
    // Where data is first written for signature file creation
    getAllowedExportPatterns(['/tmp/**/*'])
  );
}
