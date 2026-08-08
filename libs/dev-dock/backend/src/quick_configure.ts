import { dirname, join } from 'node:path';
import { Optional, iter } from '@votingworks/basics';
import {
  FileSystemEntry,
  FileSystemEntryType,
  listDirectory,
} from '@votingworks/fs';
import { writeMockFileTree } from '@votingworks/usb-drive';
import {
  ELECTION_PACKAGE_FOLDER,
  getDesignDevWorkspaceDir,
} from '@votingworks/utils';

// The repo root is 4 levels up from this file's directory
// (libs/dev-dock/backend/src -> libs/dev-dock/backend -> libs/dev-dock -> libs -> repo root)
const REPO_ROOT = join(__dirname, '../../../..');

/**
 * Where VxDesign writes its exports in development, one subdirectory per
 * jurisdiction.
 */
export const DESIGN_EXPORT_DIR = getDesignDevWorkspaceDir(REPO_ROOT);

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
  writeMockFileTree(electionDirPath, {
    [ELECTION_PACKAGE_FOLDER]: {
      [STAGED_ELECTION_PACKAGE_FILE_NAME]: electionPackagePath,
    },
  });

  return join(
    electionDirPath,
    ELECTION_PACKAGE_FOLDER,
    STAGED_ELECTION_PACKAGE_FILE_NAME
  );
}
