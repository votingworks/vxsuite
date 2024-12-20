import { assert, lines } from '@votingworks/basics';
import { safeParseInt } from '@votingworks/types';
import { Client } from '@votingworks/db';
import { execFile } from './exec';

/**
 * Summary of disk space usage, in kilobytes.
 */
export interface DiskSpaceSummary {
  total: number;
  used: number;
  available: number;
}

/**
 * Returns the amount of free disk space available at the specified paths in
 * kilobytes. Output:
 * @example
 *
 * df /tmp --total
 * Filesystem                 1K-blocks     Used Available Use% Mounted on
 * /dev/mapper/deb12--vg-root 129524860 53099284  69799888  44% /
 * total                      129524860 53099284  69799888  44% -
 */
export async function getDiskSpaceSummary(
  paths: string[]
): Promise<DiskSpaceSummary> {
  const { stdout } = await execFile('df', [...paths, '--total']);
  const totalLine = lines(stdout)
    .filter((line) => line)
    .last();
  assert(totalLine !== undefined, 'no output from df');
  const [total, used, available] = totalLine
    .split(/\s+/)
    .slice(1, 4)
    .map((s) => safeParseInt(s).unsafeUnwrap());
  assert(total !== undefined && used !== undefined && available !== undefined);
  return { total, used, available };
}

/**
 * A schema for tracking maximum *usable* disk space in a store.
 */
export const SYSTEM_INFORMATION_DISK_SPACE_TABLE_SCHEMA = `
create table system_information (
  -- enforce singleton table
  id integer primary key check (id = 1),
  maximum_usable_disk_space integer not null default 1
);

insert into system_information default values;
`;

/**
 * Updates `maximum_usable_disk_space` in the `system_information` table.
 */
export function updateMaximumUsableDiskSpace(
  client: Client,
  available: number
): void {
  client.run(
    `
      update system_information
      set maximum_usable_disk_space = ?
    `,
    available
  );
}

/**
 * Retrieves `maximum_usable_disk_space` from the `system_information` table.
 */
export function getMaximumUsableDiskSpace(client: Client): number {
  const row = client.one(
    `
      select maximum_usable_disk_space as maximumUsableDiskSpace
      from system_information
    `
  ) as { maximumUsableDiskSpace: number };

  return row.maximumUsableDiskSpace;
}

/**
 * Store which can track a single number for maximum usable disk space.
 */
export interface UsableDiskSpaceStore {
  getMaximumUsableDiskSpace: () => number;
  updateMaximumUsableDiskSpace: (available: number) => void;
}

/**
 * Returns the disk space summary for the workspace - the total, used, and
 * available. Rather than rely on the volume's disk space summary, we track the
 * maximum usable disk space over time and use that as the total. As such,
 * we're not counting fixed disk space (code, config, etc.) as unavailable and
 * have a more accurate picture of the disk space available to the application.
 *
 * While checking, this method will also update the store with a new maximum
 * disk space if the current available disk space is greater than the
 * previous maximum.
 */
export async function getWorkspaceDiskSpaceSummary(
  store: UsableDiskSpaceStore,
  workspacePaths: string[]
): Promise<DiskSpaceSummary> {
  const previousMaximumDiskSpace = store.getMaximumUsableDiskSpace();
  const currentDiskSpaceSummary = await getDiskSpaceSummary(workspacePaths);

  const maximumDiskSpace = Math.max(
    previousMaximumDiskSpace,
    currentDiskSpaceSummary.available
  );

  if (maximumDiskSpace > previousMaximumDiskSpace) {
    store.updateMaximumUsableDiskSpace(maximumDiskSpace);
  }

  return {
    total: maximumDiskSpace,
    available: currentDiskSpaceSummary.available,
    used: maximumDiskSpace - currentDiskSpaceSummary.available,
  };
}

/**
 * Returns a `getWorkspaceDiskSpaceSummary` with bound parameters, and makes
 * an initial call to `getWorkspaceDiskSpaceSummary` to ensure the store checks
 * for a maximum on startup.
 */
export function initializeGetWorkspaceDiskSpaceSummary(
  store: UsableDiskSpaceStore,
  workspacePaths: string[]
): () => Promise<DiskSpaceSummary> {
  void getWorkspaceDiskSpaceSummary(store, workspacePaths);

  return () => getWorkspaceDiskSpaceSummary(store, workspacePaths);
}
