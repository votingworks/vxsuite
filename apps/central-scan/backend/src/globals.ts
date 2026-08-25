import { getNodeEnv } from '@votingworks/backend';
import { Optional } from '@votingworks/basics';
import { join } from 'node:path';

/**
 * Default port for the scan API.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.FRONTEND_PORT || 3000) + 1;

/**
 * Where should the database and image files etc go?
 */
export function getScanWorkspace(): Optional<string> {
  return (
    process.env.SCAN_WORKSPACE ??
    (getNodeEnv() === 'development'
      ? join(import.meta.dirname, '../dev-workspace')
      : undefined)
  );
}
