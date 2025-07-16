import { assert, lines } from '@votingworks/basics';
import { safeParseInt } from '@votingworks/types';
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
