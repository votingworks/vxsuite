// @coverage-exclude-file: environment-derived configuration
import { getAllowedExportPatterns } from '@votingworks/backend';

/**
 * Default port for the server.
 */
// eslint-disable-next-line vx/gts-safe-number-parse
export const PORT = Number(process.env.FRONTEND_PORT || 3000) + 1;

/**
 * Where should the database and other files go?
 */
export function getPrintWorkspace(): string {
  return process.env.PRINT_WORKSPACE || 'dev-workspace';
}

/**
 * Where are exported files allowed to be written to?
 */
export function getPrintAllowedExportPatterns(): string[] {
  // Where data is first written for signature file creation
  return getAllowedExportPatterns(['/tmp/**/*']);
}
