import { join } from 'node:path';

/**
 * Returns the root directory for mock state files, namespaced by NODE_ENV.
 *
 * Using a dotfile directory inside the repo root ensures that:
 * - Different git worktrees use different directories and don't interfere
 * - Multiple apps in the same worktree share the same mock state
 * - Tests (NODE_ENV=test) are isolated from development instances
 *
 * The directory is gitignored at the repo root level.
 */
export function getMockStateRootDir(repoRoot: string): string {
  const rawNodeEnv = process.env['NODE_ENV'];
  // Sanitize NODE_ENV to prevent path traversal and ensure a safe directory name.
  // Fall back to 'development' if NODE_ENV is unset or empty after sanitization.
  const nodeEnv = rawNodeEnv?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'development';
  return join(repoRoot, '.mock-state', nodeEnv);
}
