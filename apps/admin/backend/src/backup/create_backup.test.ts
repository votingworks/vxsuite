// What a backup a run finished looks like: its contents, its shape on the
// drive, and what it reported along the way. Failures live in
// `create_backup_failures.test.ts`; reading a backup back lives in
// `validate_backup.test.ts`.

import { beforeEach, expect, test, vi } from 'vitest';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { SIGNATURE_FILE_EXTENSION } from '@votingworks/auth';
import { syncFilesystem } from '@votingworks/usb-drive';
import { assertDefined, iter } from '@votingworks/basics';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import { BackupStep, createBackup } from './create_backup.js';
import {
  BACKUPS_DIRECTORY_NAME,
  backupFilePath,
  isTransientBackupDirectoryName,
  manifestPath,
  readManifest,
  WORKSPACE_DIRECTORY_NAME,
} from './manifest.js';
import { validateBackup } from './validate_backup.js';
import {
  BALLOT_IMAGE_CONTENTS,
  BALLOT_IMAGE_PATH,
  createValidBackup,
  expectedBackupDirectoryName,
  loggedSteps,
  MACHINE_CONFIG,
  makeConfiguredWorkspace,
  mockLogger,
  mockRoomToWorkIn,
} from '../../test/backup.js';

vi.mock(
  '@votingworks/backend',
  async (importActual): Promise<typeof import('@votingworks/backend')> => ({
    ...(await importActual<typeof import('@votingworks/backend')>()),
    getDiskSpaceSummary: vi.fn(),
  })
);

vi.mock(
  '@votingworks/usb-drive',
  async (importActual): Promise<typeof import('@votingworks/usb-drive')> => ({
    ...(await importActual<typeof import('@votingworks/usb-drive')>()),
    syncFilesystem: vi.fn(),
  })
);

const electionDefinition = readElectionGeneralDefinition();

beforeEach(() => {
  mockRoomToWorkIn();
});

test('creates a signed backup that validates', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const steps: BackupStep[] = [];

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
    onProgress: ({ step }) => {
      if (steps[steps.length - 1] !== step) {
        steps.push(step);
      }
    },
  });

  const { backupDirectoryPath, manifest } = result.unsafeUnwrap();
  expect(backupDirectoryPath).toEqual(
    join(target, BACKUPS_DIRECTORY_NAME, expectedBackupDirectoryName())
  );
  expect(steps).toEqual([
    'checking_space',
    'snapshotting_database',
    'copying_files',
    'signing',
    'flushing',
    'validating',
    'swapping',
  ]);

  expect(manifest.version).toEqual(1);
  expect(manifest.softwareVersion).toEqual('1.2.3');
  expect(manifest.machineId).toEqual('AD-1234');
  expect(manifest.election.title).toEqual(electionDefinition.election.title);
  expect(manifest.files.map((file) => file.path)).toEqual([
    'data.db',
    BALLOT_IMAGE_PATH,
    expect.stringMatching(/^election-packages\/.*\.zip$/),
    'machine_mode',
  ]);
  for (const file of manifest.files) {
    expect(
      statSync(backupFilePath(backupDirectoryPath, file.path)).size
    ).toEqual(file.size);
  }

  // The snapshot the backup was taken from is cleaned up.
  expect((await readManifest(backupDirectoryPath)).unsafeUnwrap()).toEqual(
    manifest
  );
  expect(
    readFileSync(
      backupFilePath(backupDirectoryPath, BALLOT_IMAGE_PATH),
      'utf-8'
    )
  ).toEqual(BALLOT_IMAGE_CONTENTS);

  expect(
    (
      await validateBackup({
        backupDirectoryPath,
        expectedSoftwareVersion: '1.2.3',
      })
    ).unsafeUnwrap()
  ).toEqual(manifest);
});

test('the signature file is inside the backup directory', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  expect(
    statSync(
      `${manifestPath(backupDirectoryPath)}${SIGNATURE_FILE_EXTENSION}`
    ).isFile()
  ).toEqual(true);
});

test('keeps the manifest out of the namespace the workspace files live in', async () => {
  const workspace = await makeConfiguredWorkspace();
  // A workspace file named like the manifest would otherwise be copied over it,
  // permanently breaking every backup of that workspace.
  writeFileSync(join(workspace.path, 'manifest.json'), 'not the manifest');
  const target = makeTemporaryDirectory();

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });

  const { backupDirectoryPath, manifest } = result.unsafeUnwrap();
  expect(manifest.files.map((file) => file.path)).toContain('manifest.json');
  expect(readdirSync(backupDirectoryPath).sort()).toEqual([
    'manifest.json',
    `manifest.json${SIGNATURE_FILE_EXTENSION}`,
    WORKSPACE_DIRECTORY_NAME,
  ]);
  expect(
    readFileSync(backupFilePath(backupDirectoryPath, 'manifest.json'), 'utf-8')
  ).toEqual('not the manifest');
  expect((await validateBackup({ backupDirectoryPath })).err()).toBeUndefined();
});

test('logs each stage once, however many files it copies', async () => {
  const workspace = await makeConfiguredWorkspace();
  const testLogger = mockLogger();
  let copyingFilesUpdates = 0;

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: testLogger,
    onProgress: ({ step }) => {
      if (step === 'copying_files') {
        copyingFilesUpdates += 1;
      }
    },
  });
  result.unsafeUnwrap();

  // The caller sees an update per file; the log gets one line per stage.
  expect(copyingFilesUpdates).toBeGreaterThan(1);
  expect(loggedSteps(testLogger)).toEqual([
    'checking_space',
    'snapshotting_database',
    'copying_files',
    'signing',
    'flushing',
    'validating',
    'swapping',
  ]);
});

test('the copy reaches the end of its progress bar', async () => {
  const workspace = await makeConfiguredWorkspace();
  let lastCopying: { bytesCompleted: number; bytesTotal: number } | undefined;

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
    onProgress: (progress) => {
      if (progress.step === 'copying_files') {
        lastCopying = progress;
      }
    },
  });

  const { manifest } = result.unsafeUnwrap();
  // Counting the live database rather than the smaller snapshot that is
  // actually copied would leave the bar short of its end on every backup.
  expect(assertDefined(lastCopying).bytesCompleted).toEqual(
    assertDefined(lastCopying).bytesTotal
  );
  expect(assertDefined(lastCopying).bytesTotal).toEqual(
    iter(manifest.files).sum(({ size }) => size)
  );
});

test('flushes the drive before the backup takes its final name', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  // Whether the backup is visible under its final name at each flush. A drive
  // pulled between the two flushes must not hold a name whose contents were
  // never flushed.
  const backupWasVisible: boolean[] = [];
  vi.mocked(syncFilesystem).mockImplementation((path) => {
    expect(path).toEqual(target);
    backupWasVisible.push(existsSync(backupDirectoryPath));
    return Promise.resolve();
  });

  (
    await createBackup({
      workspace,
      targetDirectoryPath: target,
      machineConfig: MACHINE_CONFIG,
      logger: mockLogger(),
    })
  ).unsafeUnwrap();

  expect(backupWasVisible).toEqual([false, true]);
});

test('a second backup replaces the first, leaving no transient directories', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();

  const first = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  first.unsafeUnwrap();

  writeFileSync(join(workspace.path, BALLOT_IMAGE_PATH), 'different bytes');

  const second = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  const { backupDirectoryPath } = second.unsafeUnwrap();

  expect(
    readFileSync(
      backupFilePath(backupDirectoryPath, BALLOT_IMAGE_PATH),
      'utf-8'
    )
  ).toEqual('different bytes');
  expect((await validateBackup({ backupDirectoryPath })).err()).toBeUndefined();
  expect(
    isTransientBackupDirectoryName(`${expectedBackupDirectoryName()}-previous`)
  ).toEqual(true);
  expect(() => statSync(`${backupDirectoryPath}-previous`)).toThrow();
  expect(() => statSync(`${backupDirectoryPath}-in-progress`)).toThrow();
});

test('does not back up a hot rollback journal', async () => {
  const workspace = await makeConfiguredWorkspace();
  // SQLite is left in its default `delete` journal mode, so this is the file a
  // crashed VxAdmin leaves behind — and it belongs to the database beside it,
  // not to the snapshot a restore would write.
  writeFileSync(join(workspace.path, 'data.db-journal'), 'hot journal');

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });

  const { manifest } = result.unsafeUnwrap();
  expect(manifest.files.map((file) => file.path)).not.toContain(
    'data.db-journal'
  );
});

test('clears snapshots left behind by runs that were killed', async () => {
  const workspace = await makeConfiguredWorkspace();
  // Each run names its snapshot after the clock, so nothing else would ever
  // delete these and they are full copies of the election database.
  writeFileSync(join(workspace.path, 'backup-tmp-1.db'), 'stale snapshot');
  writeFileSync(join(workspace.path, 'backup-tmp-2.db'), 'stale snapshot');

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  result.unsafeUnwrap();

  expect(
    readdirSync(workspace.path).filter((name) => name.startsWith('backup-tmp-'))
  ).toEqual([]);
});
