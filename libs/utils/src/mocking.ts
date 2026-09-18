import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Sanitizes a value for use as a single path segment. */
function toPathSegment(value?: string): string | undefined {
  return value?.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Returns an id distinguishing this test run from earlier ones. It is published
 * to the environment because tests shell out to helpers (the dev dock's mock
 * card script, for one) that have to resolve the same directory as the test
 * process that spawned them.
 */
function getRunId(): string {
  const published = toPathSegment(process.env['VX_MOCK_STATE_RUN_ID']);
  if (published !== undefined) return published;
  const runId = String(process.pid);
  process.env['VX_MOCK_STATE_RUN_ID'] = runId;
  return runId;
}

/**
 * Returns a segment isolating the calling vitest worker, or `undefined` outside
 * vitest. A full-workspace `pnpm test` runs many packages' suites at once, and
 * without this they would share one mock state directory and race. Playwright
 * integration tests drive app processes that must see the same directory as the
 * test, and run outside vitest, so they keep the shared one.
 *
 * The run id makes each run's directory new, so a worker never starts against
 * mock state left by an earlier run: vitest assigns test files to workers
 * afresh each time, so a reused directory would hand a file another file's
 * leftovers. The worker id is redundant under vitest's default `forks` pool,
 * where every worker is its own process, and is what keeps workers apart under
 * `threads`, where they share a pid and an environment.
 */
function getVitestWorkerSegment(): string | undefined {
  const workerId = toPathSegment(process.env['VITEST_WORKER_ID']);
  if (workerId === undefined) return undefined;
  const packageName =
    toPathSegment(process.env['npm_package_name']) ?? 'unknown';
  return `${packageName}-${getRunId()}-${workerId}`;
}

/**
 * Returns the root directory for mock state files, namespaced by NODE_ENV.
 *
 * Using a dotfile directory inside the repo root ensures that:
 * - Different git worktrees use different directories and don't interfere
 * - Multiple apps in the same worktree share the same mock state
 * - Tests (NODE_ENV=test) are isolated from development instances
 *
 * The directory is gitignored at the repo root level.
 *
 * Under vitest the directory instead lives in the OS temporary directory, keyed
 * by worker and repo root: test state is throwaway, so keeping it out of the
 * worktree leaves nothing to clean up, and the repo key keeps worktrees running
 * the same suite apart.
 */
export function getMockStateRootDir(repoRoot: string): string {
  // Sanitize NODE_ENV to prevent path traversal and ensure a safe directory name.
  // Fall back to 'development' if NODE_ENV is unset or empty after sanitization.
  const nodeEnv = toPathSegment(process.env['NODE_ENV']) ?? 'development';
  const workerSegment = getVitestWorkerSegment();
  if (workerSegment === undefined) {
    return join(repoRoot, '.mock-state', nodeEnv);
  }
  const repoKey = createHash('sha256')
    .update(repoRoot)
    .digest('hex')
    .slice(0, 8);
  return join(
    tmpdir(),
    'vx-mock-state',
    nodeEnv,
    `${repoKey}-${workerSegment}`
  );
}

/**
 * Returns VxDesign's development workspace, where it writes exported election
 * packages and ballots.
 *
 * Shared so that dev tooling reading those exports (the dev dock) and VxDesign
 * itself agree on one location. Note that VxDesign also honors a `WORKSPACE`
 * environment variable, which other processes can't discover — so a custom
 * workspace won't be visible to dev tooling.
 */
// @coverage-defer
export function getDesignDevWorkspaceDir(repoRoot: string): string {
  return join(repoRoot, 'apps/design/backend/dev-workspace');
}
