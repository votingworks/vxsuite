import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { ELECTION_PACKAGE_FOLDER } from '@votingworks/utils';
import {
  QUICK_CONFIGURE_ELECTION_DIR,
  STAGED_ELECTION_PACKAGE_FILE_NAME,
  findLatestVxDesignElectionPackage,
  stageElectionPackageOnMockUsbDrive,
} from './quick_configure.js';

function writeFileWithModifiedTime(path: string, mtime: Date): void {
  fs.mkdirSync(join(path, '..'), { recursive: true });
  fs.writeFileSync(path, path);
  fs.utimesSync(path, mtime, mtime);
}

test('findLatestVxDesignElectionPackage returns undefined when VxDesign has not exported anything', async () => {
  const searchDir = join(makeTemporaryDirectory(), 'dev-workspace');
  expect(await findLatestVxDesignElectionPackage(searchDir)).toBeUndefined();

  fs.mkdirSync(searchDir);
  expect(await findLatestVxDesignElectionPackage(searchDir)).toBeUndefined();
});

test('findLatestVxDesignElectionPackage picks the newest package across jurisdictions', async () => {
  const searchDir = makeTemporaryDirectory();
  writeFileWithModifiedTime(
    join(searchDir, 'jurisdiction-a/election-package-aaa-111.zip'),
    new Date('2026-01-01')
  );
  const newestPath = join(
    searchDir,
    'jurisdiction-b/election-package-bbb-222.zip'
  );
  writeFileWithModifiedTime(newestPath, new Date('2026-03-01'));
  writeFileWithModifiedTime(
    join(searchDir, 'jurisdiction-b/election-package-ccc-333.zip'),
    new Date('2026-02-01')
  );

  expect(await findLatestVxDesignElectionPackage(searchDir)).toEqual(
    newestPath
  );
});

test('findLatestVxDesignElectionPackage ignores ballot zips and loose files', async () => {
  const searchDir = makeTemporaryDirectory();
  const packagePath = join(
    searchDir,
    'jurisdiction-a/election-package-aaa-111.zip'
  );
  writeFileWithModifiedTime(packagePath, new Date('2026-01-01'));
  // Ballot zips are written alongside election packages, and are newer here.
  writeFileWithModifiedTime(
    join(searchDir, 'jurisdiction-a/official-ballots-aaa.zip'),
    new Date('2026-04-01')
  );
  writeFileWithModifiedTime(
    join(searchDir, 'jurisdiction-a/test-ballots-aaa.zip'),
    new Date('2026-04-01')
  );
  writeFileWithModifiedTime(
    join(searchDir, 'jurisdiction-a/election-package-notes.txt'),
    new Date('2026-04-01')
  );
  // Files at the top level aren't in a jurisdiction directory.
  writeFileWithModifiedTime(
    join(searchDir, 'election-package-ddd-444.zip'),
    new Date('2026-04-01')
  );
  fs.mkdirSync(join(searchDir, 'jurisdiction-a/election-package-eee-555.zip'));

  expect(await findLatestVxDesignElectionPackage(searchDir)).toEqual(
    packagePath
  );
});

test('stageElectionPackageOnMockUsbDrive writes the layout machines look for', () => {
  const searchDir = makeTemporaryDirectory();
  const packagePath = join(searchDir, 'election-package-aaa-111.zip');
  fs.writeFileSync(packagePath, 'election package contents');

  const usbDriveDataPath = makeTemporaryDirectory();
  const stagedPath = stageElectionPackageOnMockUsbDrive(
    packagePath,
    usbDriveDataPath
  );

  expect(stagedPath).toEqual(
    join(
      usbDriveDataPath,
      QUICK_CONFIGURE_ELECTION_DIR,
      ELECTION_PACKAGE_FOLDER,
      STAGED_ELECTION_PACKAGE_FILE_NAME
    )
  );
  expect(fs.readFileSync(stagedPath, 'utf-8')).toEqual(
    'election package contents'
  );
});

test('stageElectionPackageOnMockUsbDrive replaces the staged package and nothing else', () => {
  const searchDir = makeTemporaryDirectory();
  const firstPackagePath = join(searchDir, 'election-package-aaa-111.zip');
  fs.writeFileSync(firstPackagePath, 'first');
  const secondPackagePath = join(searchDir, 'election-package-bbb-222.zip');
  fs.writeFileSync(secondPackagePath, 'second');

  const usbDriveDataPath = makeTemporaryDirectory();
  const unrelatedPath = join(usbDriveDataPath, 'cast-vote-records/cvrs.jsonl');
  fs.mkdirSync(join(usbDriveDataPath, 'cast-vote-records'));
  fs.writeFileSync(unrelatedPath, 'cvrs');

  const firstStagedPath = stageElectionPackageOnMockUsbDrive(
    firstPackagePath,
    usbDriveDataPath
  );
  const secondStagedPath = stageElectionPackageOnMockUsbDrive(
    secondPackagePath,
    usbDriveDataPath
  );

  expect(secondStagedPath).toEqual(firstStagedPath);
  expect(fs.readFileSync(secondStagedPath, 'utf-8')).toEqual('second');
  expect(fs.readFileSync(unrelatedPath, 'utf-8')).toEqual('cvrs');
});

test('stageElectionPackageOnMockUsbDrive skips a package that is already staged', () => {
  const searchDir = makeTemporaryDirectory();
  const packagePath = join(searchDir, 'election-package-aaa-111.zip');
  fs.writeFileSync(packagePath, 'election package contents');

  const usbDriveDataPath = makeTemporaryDirectory();
  const stagedPath = stageElectionPackageOnMockUsbDrive(
    packagePath,
    usbDriveDataPath
  );

  // The staged package can be selected from the dev dock and staged again,
  // which would otherwise copy the file onto itself.
  expect(
    stageElectionPackageOnMockUsbDrive(stagedPath, usbDriveDataPath)
  ).toEqual(stagedPath);
  expect(fs.readFileSync(stagedPath, 'utf-8')).toEqual(
    'election package contents'
  );
});
