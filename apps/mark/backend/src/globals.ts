// @coverage-exclude-file: environment-derived configuration
import { join } from 'node:path';
import { getNodeEnv } from '@votingworks/backend';
import { Optional } from '@votingworks/basics';

/**
 * Default port for the VxMark API.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.FRONTEND_PORT || 3000) + 1;

/**
 * Where should the database and audio files go?
 */
export function getMarkWorkspace(): Optional<string> {
  return (
    process.env.MARK_WORKSPACE ??
    (getNodeEnv() === 'development'
      ? join(import.meta.dirname, '../dev-workspace')
      : undefined)
  );
}
