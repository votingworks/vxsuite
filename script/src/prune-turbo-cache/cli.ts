import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { IO } from '../types';

// Every cache entry is stored as <hash>.tar.zst alongside these sidecars, so
// the leading hash identifies the entry a file belongs to.
const CACHE_ENTRY_SUFFIXES = ['.tar.zst', '-meta.json', '-manifest.json'];

interface RunSummaryTask {
  readonly hash?: string;
}

interface RunSummary {
  readonly tasks?: readonly RunSummaryTask[];
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function directoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Collects the hash of every task turbo ran, across all the run summaries it
 * wrote. A job runs turbo more than once (build, then lint, then test), and
 * each run summarizes its dependencies too, so the union covers everything the
 * job needed.
 */
function collectLiveHashes(runsDir: string): Set<string> {
  const hashes = new Set<string>();

  for (const entry of readdirSync(runsDir)) {
    if (!entry.endsWith('.json')) continue;

    const summary = JSON.parse(
      readFileSync(resolve(runsDir, entry), 'utf8')
    ) as RunSummary;

    for (const task of summary.tasks ?? []) {
      if (task.hash) {
        hashes.add(task.hash);
      }
    }
  }

  return hashes;
}

function hashForCacheFile(fileName: string): string | undefined {
  const suffix = CACHE_ENTRY_SUFFIXES.find((candidate) =>
    fileName.endsWith(candidate)
  );
  return suffix ? fileName.slice(0, -suffix.length) : undefined;
}

function directorySizeBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      total += statSync(resolve(dir, entry.name)).size;
    }
  }
  return total;
}

function formatBytes(bytes: number): string {
  const megabytes = bytes / 1024 / 1024;
  return `${megabytes.toFixed(1)}MB`;
}

/**
 * Prunes turbo's cache down to the entries the current CI job actually used.
 *
 * CI restores the cache at the start of a job and saves it again at the end.
 * Turbo never evicts anything, so without pruning that archive would grow with
 * every build until it held the union of every hash the job has ever seen.
 * Pruning by age would be wrong: turbo does not update an entry's mtime on a
 * cache hit, so the oldest entries are typically the hottest ones.
 */
export function main({ stdout, stderr }: IO): number {
  const cacheDir = resolve(
    process.cwd(),
    git('rev-parse', '--git-common-dir'),
    '..',
    '.turbo',
    'cache'
  );
  const runsDir = resolve(git('rev-parse', '--show-toplevel'), '.turbo/runs');

  if (!directoryExists(cacheDir)) {
    stdout.write(`No turbo cache at ${cacheDir}; nothing to prune.\n`);
    return 0;
  }

  // Without summaries there is no way to tell which entries are live, and
  // deleting everything would throw away a usable cache. CI asks for them by
  // setting TURBO_RUN_SUMMARY, but a job that fails before turbo runs won't
  // have written any.
  if (!directoryExists(runsDir)) {
    stderr.write(
      `No turbo run summaries at ${runsDir}; leaving cache as-is.\n`
    );
    return 0;
  }

  const liveHashes = collectLiveHashes(runsDir);

  // Summaries that name no tasks tell us nothing, so treat them the same as
  // having none at all rather than emptying the cache.
  if (liveHashes.size === 0) {
    stderr.write(`No tasks in the turbo run summaries; leaving cache as-is.\n`);
    return 0;
  }

  const sizeBefore = directorySizeBytes(cacheDir);
  let kept = 0;
  let removed = 0;

  for (const fileName of readdirSync(cacheDir)) {
    const hash = hashForCacheFile(fileName);

    // Keep anything whose name we don't recognize rather than deleting a file
    // whose purpose we can't determine.
    if (!hash || liveHashes.has(hash)) {
      kept += 1;
      continue;
    }

    rmSync(resolve(cacheDir, fileName), { force: true });
    removed += 1;
  }

  stdout.write(
    `Pruned turbo cache: kept ${kept} files, removed ${removed}; ` +
      `live task hashes: ${liveHashes.size} ` +
      `(${formatBytes(sizeBefore)} -> ${formatBytes(
        directorySizeBytes(cacheDir)
      )}).\n`
  );

  return 0;
}
