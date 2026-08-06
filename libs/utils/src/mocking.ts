import { join } from 'node:path';

/**
 * Returns the root directory for mock state files, namespaced by NODE_ENV.
 *
 * Using a dotfile directory inside the repo root ensures that:
 * - Different git worktrees use different directories and don't interfere
 * - Multiple apps in the same worktree share the same mock state
 * - Tests (NODE_ENV=test) are isolated from development instances
 *
 * Under a task runner that executes many packages' unit tests concurrently in
 * one shared worktree (e.g. moon), the test env is additionally namespaced by
 * the runner's per-project id (`MOON_PROJECT_ID`), which child processes inherit
 * — so concurrent projects don't clobber each other's mock files, while a
 * project's own test process and its mock subprocesses (e.g. the card mock)
 * still coordinate in one dir. The normal per-package CI runs each package in
 * isolation, so this is a no-op there.
 *
 * The directory is gitignored at the repo root level.
 */
export function getMockStateRootDir(repoRoot: string): string {
  const rawNodeEnv = process.env['NODE_ENV'];
  // Sanitize NODE_ENV to prevent path traversal and ensure a safe directory name.
  // Fall back to 'development' if NODE_ENV is unset or empty after sanitization.
  const nodeEnv = rawNodeEnv?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'development';
  const root = join(repoRoot, '.mock-state', nodeEnv);

  const projectId = process.env['MOON_PROJECT_ID']?.replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  if (nodeEnv === 'test' && projectId) {
    return join(root, projectId);
  }
  return root;
}
