import { assert, assertDefined, iter, lines } from '@votingworks/basics';
import { safeParseInt } from '@votingworks/types';
import type { DiskSpaceSummary } from '@votingworks/utils';
import { execFile } from '../exec';

const DF_ROW_PATTERN = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/;

/**
 * Disk space usage in kilobytes for a single queried path, along with the
 * mountpoint of the filesystem containing it. Paths on the same filesystem
 * share a mountpoint and report identical usage, so aggregating across paths
 * means deduplicating by `mountpoint` first.
 */
export interface PathDiskSpaceSummary extends DiskSpaceSummary {
  readonly path: string;
  readonly mountpoint: string;
}

/**
 * Disk space summaries matching the arity of the paths they were queried with:
 * a tuple of paths yields a tuple of summaries of the same length, an array of
 * unknown length yields an array.
 */
export type PathDiskSpaceSummaries<P extends readonly string[]> = {
  -readonly [K in keyof P]: PathDiskSpaceSummary;
};

/**
 * Returns disk space usage in kilobytes for each of `paths`, in the order
 * given. Output:
 * @example
 *
 * df -k --output=size,used,avail,target /tmp /var
 * 1K-blocks      Used    Avail Mounted on
 *    940768        40   875604 /tmp
 *  91997880   4424092 82854584 /var
 */
export function getDiskSpaceSummaries<const P extends readonly string[]>(
  paths: P
): Promise<PathDiskSpaceSummaries<P>>;

/**
 * Returns disk space usage in kilobytes for each of `paths`, in the order
 * given.
 */
export async function getDiskSpaceSummaries(
  paths: readonly string[]
): Promise<PathDiskSpaceSummary[]> {
  if (paths.length === 0) return [];
  const { stdout } = await execFile('df', [
    '-k',
    '--output=size,used,avail,target',
    ...paths,
  ]);
  const rows = lines(stdout)
    .filter((line) => line)
    .skip(1)
    .toArray();
  assert(
    rows.length === paths.length,
    `expected one row of df output per path, got ${rows.length} for ${paths.length} path(s)`
  );
  return iter(paths)
    .zip(rows)
    .map(([path, row]) => {
      const match = row.match(DF_ROW_PATTERN);
      assert(match, `unexpected df output: ${row}`);
      const [, total, used, available, mountpoint] = match;
      return {
        path,
        mountpoint: assertDefined(mountpoint),
        total: safeParseInt(total).unsafeUnwrap(),
        used: safeParseInt(used).unsafeUnwrap(),
        available: safeParseInt(available).unsafeUnwrap(),
      };
    })
    .toArray();
}
