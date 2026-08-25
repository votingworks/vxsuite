/* istanbul ignore file */
import { join } from 'node:path';
import { getNodeEnv } from '@votingworks/backend';
import { Optional } from '@votingworks/basics';

/**
 * Default port for the VxMarkScan API.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.FRONTEND_PORT || 3000) + 1;

/**
 * Where should the database, audio, and hardware status files go?
 */
export function getMarkScanWorkspace(): Optional<string> {
  return (
    process.env.MARK_SCAN_WORKSPACE ??
    (getNodeEnv() === 'development'
      ? join(import.meta.dirname, '../dev-workspace')
      : undefined)
  );
}
