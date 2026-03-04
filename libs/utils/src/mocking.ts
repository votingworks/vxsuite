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
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  return join(repoRoot, '.mock-state', nodeEnv);
}
