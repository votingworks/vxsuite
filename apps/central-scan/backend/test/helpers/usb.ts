import { UsbDrive } from '@votingworks/backend';
import { assert } from '@votingworks/basics';
import { SCANNER_RESULTS_FOLDER } from '@votingworks/utils';
import { join } from 'path';
import { readdirSync, statSync } from 'fs';

/**
 * Test helper to get the paths of the cast vote record reports on the
 * mock usb drive. Requires that the USB drive be mounted and that it contains
 * results for only one election. Returns the paths in ordered from newest to
 * oldest.
 */
export function getCastVoteRecordReportPaths(usbDrive: UsbDrive): string[] {
  assert(usbDrive.mountPoint !== undefined);
  const resultsDirPath = join(usbDrive.mountPoint, SCANNER_RESULTS_FOLDER);
  const electionDirs = readdirSync(resultsDirPath);
  expect(electionDirs).toHaveLength(1);
  const electionDirPath = join(resultsDirPath, electionDirs[0]);
  const cvrReportDirectories = readdirSync(electionDirPath).filter(
    // Filter out signature files
    (path) => !path.endsWith('.vxsig')
  );
  return cvrReportDirectories
    .map((cvrReportDirectory) => join(electionDirPath, cvrReportDirectory))
    .sort((pathA, pathB) => {
      const ctimeA = statSync(pathA).ctime;
      const ctimeB = statSync(pathB).ctime;
      return ctimeB.getTime() - ctimeA.getTime();
    });
}
