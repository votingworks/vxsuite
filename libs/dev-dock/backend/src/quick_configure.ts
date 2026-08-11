import { dirname, join, resolve } from 'node:path';
import { Optional, iter } from '@votingworks/basics';
import {
  FileSystemEntry,
  FileSystemEntryType,
  listDirectory,
} from '@votingworks/fs';
import { writeMockFileTree } from '@votingworks/usb-drive';
import { ELECTION_PACKAGE_FOLDER } from '@votingworks/utils';

/**
 * The election directory that the `QuickConfigure` feature owns on the
 * mock USB drive.
 */
export const QUICK_CONFIGURE_ELECTION_DIR = 'dev-election';

/**
 * The name quick configure stages packages under. A fixed name means each
 * staging replaces the last, so the directory never accumulates old packages.
 */
export const STAGED_ELECTION_PACKAGE_FILE_NAME = 'election-package.zip';

const ELECTION_PACKAGE_FILE_PREFIX = 'election-package-';

/**
 * Finds the most recently exported VxDesign election package across all
 * jurisdictions. Ballot zips are written to the same directories, so only files
 * named like election packages are considered.
 */
export async function findLatestVxDesignElectionPackage(
  searchDir: string
): Promise<Optional<string>> {
  const electionPackages: FileSystemEntry[] = [];

  // Depth 2 covers `<search dir>/<jurisdiction>/<package>.zip`. Errors mean
  // VxDesign hasn't written anything here yet, which is not a failure.
  for await (const result of listDirectory(searchDir, { depth: 2 })) {
    if (result.isErr()) continue;

    const entry = result.ok();
    if (
      entry.type === FileSystemEntryType.File &&
      // Only packages inside a jurisdiction directory, not loose at the top.
      dirname(entry.path) !== searchDir &&
      entry.name.startsWith(ELECTION_PACKAGE_FILE_PREFIX) &&
      entry.name.endsWith('.zip')
    ) {
      electionPackages.push(entry);
    }
  }

  return iter(electionPackages).maxBy((entry) => entry.mtime.getTime())?.path;
}

/**
 * Copies an election package onto the mock USB drive in the layout machines
 * look for: `<drive>/<election dir>/election-packages/<package>.zip`. Only the
 * directory quick configure owns is written, leaving the rest of the drive's
 * contents alone. Returns the path the package was copied to.
 */
export function stageElectionPackageOnMockUsbDrive(
  electionPackagePath: string,
  usbDriveDataPath: string
): string {
  const electionDirPath = join(usbDriveDataPath, QUICK_CONFIGURE_ELECTION_DIR);
  const stagedElectionPackagePath = join(
    electionDirPath,
    ELECTION_PACKAGE_FOLDER,
    STAGED_ELECTION_PACKAGE_FILE_NAME
  );

  // A previously staged package can be selected again from the dev dock, in
  // which case it's already where machines look for it and copying it would
  // just copy the file onto itself.
  if (resolve(electionPackagePath) !== resolve(stagedElectionPackagePath)) {
    writeMockFileTree(electionDirPath, {
      [ELECTION_PACKAGE_FOLDER]: {
        [STAGED_ELECTION_PACKAGE_FILE_NAME]: electionPackagePath,
      },
    });
  }

  return stagedElectionPackagePath;
}
