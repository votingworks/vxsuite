// What a backup does when something goes wrong: what it refuses before
// touching the drive, what it reports when a step fails part way through, and
// what it recovers from a run that never finished.

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {
  rename as realRename,
  rm as realRm,
  stat as realStat,
} from 'node:fs/promises';
import { join } from 'node:path';
import { getDiskSpaceSummary } from '@votingworks/backend';
import { syncFilesystem } from '@votingworks/usb-drive';
import { err } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import {
  BackupError,
  createBackup,
  formatBackupError,
} from './create_backup.js';
import { rename, rm, stat } from './fs.js';
import { BACKUPS_DIRECTORY_NAME, backupFilePath } from './manifest.js';
import { validateBackup } from './validate_backup.js';
import {
  BALLOT_IMAGE_CONTENTS,
  BALLOT_IMAGE_PATH,
  expectedBackupDirectoryName,
  loggedSteps,
  MACHINE_CONFIG,
  makeConfiguredWorkspace,
  makeUnconfiguredWorkspace,
  mockLogger,
  mockRoomToWorkIn,
} from '../../test/backup.js';

// The engine's filesystem calls go through `./fs.js` so that one of them can be
// made to fail here without standing in for `node:fs/promises` everywhere. Each
// one calls through to the real implementation unless a test says otherwise.
vi.mock('./fs.js', async (importActual) => {
  const actual = await importActual<typeof import('./fs.js')>();
  return {
    ...actual,
    rename: vi.fn(actual.rename),
    rm: vi.fn(actual.rm),
    stat: vi.fn(actual.stat),
  };
});

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

afterEach(() => {
  // Whatever a test made these do, put them back to doing the real thing.
  vi.mocked(rename).mockImplementation(realRename);
  vi.mocked(rm).mockImplementation(realRm);
  vi.mocked(stat).mockImplementation(realStat);
});

beforeEach(() => {
  mockRoomToWorkIn();
});

test('a failed backup records the stage it got to', async () => {
  const workspace = await makeConfiguredWorkspace();
  const testLogger = mockLogger();
  vi.mocked(syncFilesystem).mockRejectedValue(new Error('drive went away'));

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: testLogger,
  });
  expect(result).toEqual(
    err({ type: 'flush_failed', message: 'drive went away' })
  );

  // Without this the log would say only that the backup failed, not that it had
  // already written and signed everything and died getting it to the drive.
  expect(loggedSteps(testLogger)).toEqual([
    'checking_space',
    'snapshotting_database',
    'copying_files',
    'signing',
    'flushing',
  ]);
});

test('fails when the drive cannot be flushed', async () => {
  const workspace = await makeConfiguredWorkspace();
  vi.mocked(syncFilesystem).mockRejectedValue(new Error('drive went away'));

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  expect(result).toEqual(
    err({ type: 'flush_failed', message: 'drive went away' })
  );
});

test('refuses to back up an unconfigured workspace', async () => {
  const workspace = makeUnconfiguredWorkspace();
  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  expect(result).toEqual(err({ type: 'no_election_configured' }));
});

test('fails when the target cannot be written to', async () => {
  const workspace = await makeConfiguredWorkspace();
  const targetPath = join(makeTemporaryDirectory(), 'not-a-directory');
  writeFileSync(targetPath, 'this is a file');

  const result = await createBackup({
    workspace,
    targetDirectoryPath: targetPath,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  expect(result).toEqual(
    err({
      type: 'target_unusable',
      path: targetPath,
      message: expect.stringContaining('ENOTDIR'),
    })
  );
});

test.each([
  { location: 'workspace' as const },
  { location: 'target' as const },
])(
  'fails when there is not enough free space on the $location',
  async ({ location }) => {
    const workspace = await makeConfiguredWorkspace();
    const target = makeTemporaryDirectory();
    vi.mocked(getDiskSpaceSummary).mockImplementation((paths) => {
      const isConstrained = paths.includes(
        location === 'workspace' ? workspace.path : target
      );
      return Promise.resolve({
        total: 1_000_000_000,
        used: 0,
        available: isConstrained ? 1 : 1_000_000_000,
      });
    });

    const result = await createBackup({
      workspace,
      targetDirectoryPath: target,
      machineConfig: MACHINE_CONFIG,
      logger: mockLogger(),
    });
    expect(result).toEqual(
      err({
        type: 'insufficient_space',
        location,
        requiredBytes: expect.any(Number),
        availableBytes: 1024,
      })
    );
  }
);

test('fails when the database snapshot fails', async () => {
  const workspace = await makeConfiguredWorkspace();
  vi.spyOn(workspace.store, 'backupDatabase').mockImplementation(() => {
    throw new Error('disk on fire');
  });

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  expect(result).toEqual(
    err({
      type: 'database_snapshot_failed',
      message: 'disk on fire',
    })
  );
});

test('fails when a file disappears mid-copy', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
    onProgress: ({ step }) => {
      if (step === 'snapshotting_database') {
        rmSync(join(workspace.path, BALLOT_IMAGE_PATH));
      }
    },
  });
  expect(result).toEqual(
    err({
      // The file that failed, not just the drive it was going to.
      type: 'copy_failed',
      path: BALLOT_IMAGE_PATH,
      message: expect.stringContaining('ENOENT'),
    })
  );
  // The partial backup is cleaned up rather than left to look like a backup.
  expect(() =>
    statSync(
      join(
        target,
        BACKUPS_DIRECTORY_NAME,
        `${expectedBackupDirectoryName()}-in-progress`
      )
    )
  ).toThrow();
});

test.each([
  {
    description: 'signing',
    stepToInterruptAt: 'signing' as const,
    expectedErrorType: 'signing_failed' as const,
  },
  {
    // Validation reads the backup back before it is renamed, so a directory
    // that vanishes at that point is caught there.
    description: 'the read-back',
    stepToInterruptAt: 'validating' as const,
    expectedErrorType: 'validation_failed' as const,
  },
  {
    description: 'the swap into place',
    stepToInterruptAt: 'swapping' as const,
    expectedErrorType: 'swap_failed' as const,
  },
])(
  'fails when the backup directory disappears before $description',
  async ({ stepToInterruptAt, expectedErrorType }) => {
    const workspace = await makeConfiguredWorkspace();
    const target = makeTemporaryDirectory();

    const result = await createBackup({
      workspace,
      targetDirectoryPath: target,
      machineConfig: MACHINE_CONFIG,
      logger: mockLogger(),
      onProgress: ({ step }) => {
        if (step === stepToInterruptAt) {
          rmSync(
            join(
              target,
              BACKUPS_DIRECTORY_NAME,
              `${expectedBackupDirectoryName()}-in-progress`
            ),
            { recursive: true, force: true }
          );
        }
      },
    });
    expect(result).toEqual(
      err(
        expectedErrorType === 'validation_failed'
          ? {
              type: 'validation_failed',
              error: expect.objectContaining({ type: 'manifest_unreadable' }),
            }
          : {
              type: expectedErrorType,
              message: expect.stringContaining('ENOENT'),
            }
      )
    );
  }
);

test('fails when the backup on the drive no longer matches what was written', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
    onProgress: ({ step }) => {
      if (step === 'validating') {
        // A drive that quietly changes what it stored, caught by reading it
        // back before it is given the name a restore looks for.
        writeFileSync(
          backupFilePath(
            join(
              target,
              BACKUPS_DIRECTORY_NAME,
              `${expectedBackupDirectoryName()}-in-progress`
            ),
            BALLOT_IMAGE_PATH
          ),
          'tampered bytes!!!!'
        );
      }
    },
  });
  expect(result).toEqual(
    err({
      type: 'validation_failed',
      error: expect.objectContaining({ type: 'file_hash_mismatch' }),
    })
  );
});

test('a backup that fails to verify does not cost the drive its last good one', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  const first = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  const firstManifest = first.unsafeUnwrap().manifest;

  const second = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
    onProgress: ({ step }) => {
      if (step === 'validating') {
        writeFileSync(
          backupFilePath(
            join(
              target,
              BACKUPS_DIRECTORY_NAME,
              `${expectedBackupDirectoryName()}-in-progress`
            ),
            BALLOT_IMAGE_PATH
          ),
          'tampered bytes!!!!'
        );
      }
    },
  });
  expect(second).toEqual(
    err({
      type: 'validation_failed',
      error: expect.objectContaining({ type: 'file_hash_mismatch' }),
    })
  );

  // The whole point of reading a backup back is to catch a drive that didn't
  // store what it was given. A drive like that must not also destroy the backup
  // the jurisdiction already had.
  const survivor = (
    await validateBackup({ backupDirectoryPath })
  ).unsafeUnwrap();
  expect(survivor.createdAt).toEqual(firstManifest.createdAt);
  expect(
    readFileSync(
      backupFilePath(backupDirectoryPath, BALLOT_IMAGE_PATH),
      'utf-8'
    )
  ).toEqual(BALLOT_IMAGE_CONTENTS);
});

test.each<{ error: BackupError; expectedMessage: string }>([
  {
    error: { type: 'no_election_configured' },
    expectedMessage: 'No election is configured',
  },
  {
    error: { type: 'target_unusable', path: '/media/usb', message: 'EACCES' },
    expectedMessage: '/media/usb cannot be written to',
  },
  {
    error: {
      type: 'insufficient_space',
      location: 'target',
      requiredBytes: 100,
      availableBytes: 1,
    },
    expectedMessage: 'Not enough free space on the target',
  },
  {
    error: { type: 'database_snapshot_failed', message: 'nope' },
    expectedMessage: 'database could not be copied',
  },
  {
    error: { type: 'copy_failed', path: '/media/usb', message: 'ENOSPC' },
    expectedMessage: 'could not be written to the backup drive',
  },
  {
    error: { type: 'signing_failed', message: 'no key' },
    expectedMessage: 'could not be signed',
  },
  {
    error: { type: 'swap_failed', message: 'EBUSY' },
    expectedMessage: 'could not be moved into place',
  },
  {
    error: {
      type: 'validation_failed',
      error: { type: 'file_missing', path: 'data.db' },
    },
    expectedMessage: 'did not verify',
  },
])('formats backup error $error.type', ({ error, expectedMessage }) => {
  expect(formatBackupError(error)).toContain(expectedMessage);
});

test('recovers a backup stranded by a run that died mid-swap', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  const first = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  const firstManifest = first.unsafeUnwrap().manifest;

  // What a run interrupted between its two renames leaves behind: the good
  // backup under a name `list` hides and a restore won't read.
  renameSync(backupDirectoryPath, `${backupDirectoryPath}-previous`);

  // Fail the next run as early as it can fail, so recovery is all it does.
  vi.mocked(getDiskSpaceSummary).mockResolvedValue({
    total: 1_000_000_000,
    used: 1_000_000_000,
    available: 0,
  });
  const second = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  expect(second).toEqual(
    err(expect.objectContaining({ type: 'insufficient_space' }))
  );

  // Deleting it, as the cleanup used to, would have left the drive with no
  // backup at all once this run failed.
  const recovered = (
    await validateBackup({ backupDirectoryPath })
  ).unsafeUnwrap();
  expect(recovered.createdAt).toEqual(firstManifest.createdAt);
  expect(() => statSync(`${backupDirectoryPath}-previous`)).toThrow();
});

test('does not delete a stranded backup it could not check for', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  (
    await createBackup({
      workspace,
      targetDirectoryPath: target,
      machineConfig: MACHINE_CONFIG,
      logger: mockLogger(),
    })
  ).unsafeUnwrap();
  renameSync(backupDirectoryPath, `${backupDirectoryPath}-previous`);

  // A `stat` that fails with anything but ENOENT hasn't said the directory
  // isn't there; it has failed to answer.
  vi.mocked(stat).mockImplementation((path) =>
    String(path).endsWith('-previous')
      ? Promise.reject(new Error('EIO: i/o error, stat'))
      : realStat(path)
  );

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  expect(result).toEqual(
    err({
      type: 'target_unusable',
      path: target,
      message: expect.stringContaining('EIO'),
    })
  );

  // Treating the unanswered question as "not there" would have sent this run
  // past recovery and into the cleanup that deletes `-previous` — the drive's
  // only backup.
  expect(existsSync(`${backupDirectoryPath}-previous`)).toEqual(true);
});

test('leaves a stranded backup alone when a real one is already there', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  (
    await createBackup({
      workspace,
      targetDirectoryPath: target,
      machineConfig: MACHINE_CONFIG,
      logger: mockLogger(),
    })
  ).unsafeUnwrap();

  // A leftover beside a good backup is a partial write, not something to
  // promote over the backup that is already there.
  mkdirSync(`${backupDirectoryPath}-previous`);
  writeFileSync(join(`${backupDirectoryPath}-previous`, 'junk'), 'junk');

  const second = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  second.unsafeUnwrap();
  expect(() => statSync(`${backupDirectoryPath}-previous`)).toThrow();
});

test('reports an unreadable workspace instead of throwing', async () => {
  const workspace = await makeConfiguredWorkspace();
  const testLogger = mockLogger();
  rmSync(workspace.path, { recursive: true, force: true });

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: testLogger,
  });

  expect(result).toEqual(
    err({
      type: 'workspace_unreadable',
      path: workspace.path,
      message: expect.stringContaining('ENOENT'),
    })
  );
  // Throwing here would skip the log line that says a backup was even started.
  expect(
    vi
      .mocked(testLogger.log)
      .mock.calls.filter(
        ([eventId]) => eventId === LogEventId.BackupCreateComplete
      )
  ).toHaveLength(1);
});

test('reports a workspace that cannot be measured instead of throwing', async () => {
  const workspace = await makeConfiguredWorkspace();
  vi.mocked(getDiskSpaceSummary).mockRejectedValue(new Error('no such device'));

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });

  expect(result).toEqual(
    err({
      type: 'workspace_unreadable',
      path: workspace.path,
      message: 'no such device',
    })
  );
});

test('reports a backup drive that cannot be measured instead of throwing', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  // The internal disk answers; the drive that was pulled out doesn't.
  vi.mocked(getDiskSpaceSummary).mockImplementation(([path]) =>
    path === target
      ? Promise.reject(new Error('no such device'))
      : Promise.resolve({
          total: 1_000_000_000,
          used: 0,
          available: 1_000_000_000,
        })
  );

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });

  expect(result).toEqual(
    err({
      type: 'target_unusable',
      path: target,
      message: 'no such device',
    })
  );
});

test('a backup that cannot be flushed afterwards is still a backup', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const testLogger = mockLogger();
  // The first flush, before validation, succeeds; the one after the rename
  // fails — by which point the backup is complete and under its final name.
  vi.mocked(syncFilesystem)
    .mockResolvedValueOnce()
    .mockRejectedValue(new Error('drive went away'));

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: testLogger,
  });

  const { backupDirectoryPath } = result.unsafeUnwrap();
  expect((await validateBackup({ backupDirectoryPath })).err()).toBeUndefined();
  expect(vi.mocked(testLogger.log)).toHaveBeenCalledWith(
    LogEventId.BackupCreateComplete,
    'system',
    expect.objectContaining({
      disposition: 'failure',
      message: expect.stringContaining('could not be flushed'),
    })
  );
});

test('a snapshot that cannot be cleaned up does not fail the backup', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const testLogger = mockLogger();

  vi.mocked(rm).mockImplementation((path, options) =>
    /backup-tmp-\d+\.db$/.test(String(path))
      ? Promise.reject(new Error('EBUSY: resource busy, rm'))
      : realRm(path, options)
  );

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: testLogger,
  });

  // Crashing here would exit nonzero without the completion log line, telling
  // an operator the backup failed when a valid one is sitting on the drive.
  const { backupDirectoryPath } = result.unsafeUnwrap();
  expect((await validateBackup({ backupDirectoryPath })).err()).toBeUndefined();
  expect(vi.mocked(testLogger.log)).toHaveBeenCalledWith(
    LogEventId.BackupCreateComplete,
    'system',
    expect.objectContaining({ disposition: 'success' })
  );
});

test('fails when the new backup cannot be moved into place', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  (
    await createBackup({
      workspace,
      targetDirectoryPath: target,
      machineConfig: MACHINE_CONFIG,
      logger: mockLogger(),
    })
  ).unsafeUnwrap();

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
    onProgress: ({ step }) => {
      // Renaming the existing backup aside can't succeed onto a directory that
      // already has something in it.
      if (
        step === 'validating' &&
        !existsSync(`${backupDirectoryPath}-previous`)
      ) {
        mkdirSync(`${backupDirectoryPath}-previous`);
        writeFileSync(join(`${backupDirectoryPath}-previous`, 'junk'), 'junk');
      }
    },
  });

  expect(result).toEqual(
    err({
      type: 'swap_failed',
      // Renaming onto a non-empty directory is ENOTEMPTY or EEXIST depending
      // on the filesystem; both mean the same thing here.
      message: expect.stringMatching(/ENOTEMPTY|EEXIST/),
    })
  );
  // The backup that was already there is still the one on the drive.
  expect((await validateBackup({ backupDirectoryPath })).err()).toBeUndefined();
});

test('a backup whose old copy cannot be deleted is still a backup', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const testLogger = mockLogger();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  (
    await createBackup({
      workspace,
      targetDirectoryPath: target,
      machineConfig: MACHINE_CONFIG,
      logger: mockLogger(),
    })
  ).unsafeUnwrap();

  // Make deleting last time's copy fail after both renames have succeeded, by
  // which point the new backup is already the one on the drive.
  let swapped = false;
  vi.mocked(rm).mockImplementation((path, options) =>
    swapped && String(path).endsWith('-previous')
      ? Promise.reject(new Error('EIO'))
      : realRm(path, options)
  );

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: testLogger,
    onProgress: ({ step }) => {
      // The cleanup at the start of a run deletes `-previous` too; only the one
      // after the swap is of interest.
      swapped = swapped || step === 'swapping';
    },
  });

  // Reporting this as a failure would send someone looking for a backup that is
  // sitting right there.
  result.unsafeUnwrap();
  expect((await validateBackup({ backupDirectoryPath })).err()).toBeUndefined();
  expect(vi.mocked(testLogger.log)).toHaveBeenCalledWith(
    LogEventId.BackupCreateComplete,
    'system',
    expect.objectContaining({
      disposition: 'failure',
      message: expect.stringContaining('could not be deleted'),
    })
  );
});

test('a swap that fails half way puts the old backup back', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  const first = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  const firstManifest = first.unsafeUnwrap().manifest;

  // The old backup moves aside, then the new one fails to move into place.
  vi.mocked(rename).mockImplementation((oldPath, newPath) =>
    String(oldPath).endsWith('-in-progress')
      ? Promise.reject(new Error('EIO: i/o error, rename'))
      : realRename(oldPath, newPath)
  );

  const second = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  expect(second).toEqual(
    err({ type: 'swap_failed', message: expect.stringContaining('EIO') })
  );

  // Leaving the old backup under `-previous` — a name `list` hides and a
  // restore won't read — would leave the drive with no recognizable backup at
  // all until some future run recovered it.
  const survivor = (
    await validateBackup({ backupDirectoryPath })
  ).unsafeUnwrap();
  expect(survivor.createdAt).toEqual(firstManifest.createdAt);
  expect(existsSync(`${backupDirectoryPath}-previous`)).toEqual(false);
});

test('a swap failure that cannot be undone leaves the old backup for recovery', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  (
    await createBackup({
      workspace,
      targetDirectoryPath: target,
      machineConfig: MACHINE_CONFIG,
      logger: mockLogger(),
    })
  ).unsafeUnwrap();

  // Nothing can be renamed into the backup's place: neither the new copy nor
  // the old one being put back.
  vi.mocked(rename).mockImplementation((oldPath, newPath) =>
    String(newPath) === backupDirectoryPath
      ? Promise.reject(new Error('EIO: i/o error, rename'))
      : realRename(oldPath, newPath)
  );

  const second = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  expect(second).toEqual(
    err({ type: 'swap_failed', message: expect.stringContaining('EIO') })
  );

  // Stranded, not deleted: the recovery pass at the start of the next run can
  // still put it back.
  expect(existsSync(`${backupDirectoryPath}-previous`)).toEqual(true);
  vi.mocked(rename).mockImplementation(realRename);
  const third = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  third.unsafeUnwrap();
});

test('records the swap as the stage a failed rename reached', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const testLogger = mockLogger();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  (
    await createBackup({
      workspace,
      targetDirectoryPath: target,
      machineConfig: MACHINE_CONFIG,
      logger: mockLogger(),
    })
  ).unsafeUnwrap();

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: testLogger,
    onProgress: ({ step }) => {
      if (
        step === 'validating' &&
        !existsSync(`${backupDirectoryPath}-previous`)
      ) {
        mkdirSync(`${backupDirectoryPath}-previous`);
        writeFileSync(join(`${backupDirectoryPath}-previous`, 'junk'), 'junk');
      }
    },
  });
  expect(result.err()?.type).toEqual('swap_failed');

  // The log has to say the run died in the swap, not that it never got there.
  expect(loggedSteps(testLogger)[loggedSteps(testLogger).length - 1]).toEqual(
    'swapping'
  );
});

test('refuses to back up a workspace containing a symbolic link', async () => {
  const workspace = await makeConfiguredWorkspace();
  const elsewhere = makeTemporaryDirectory();
  writeFileSync(join(elsewhere, 'relocated'), 'ballot image bytes');
  symlinkSync(join(elsewhere, 'relocated'), join(workspace.path, 'linked'));

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });

  // Skipping it would produce a backup whose manifest and contents agree with
  // each other while missing data, so validation would pass and a restore would
  // come up short.
  expect(result).toEqual(
    err({ type: 'unsupported_workspace_entry', path: 'linked' })
  );
});

test('refuses to back up a workspace containing a symlinked directory', async () => {
  const workspace = await makeConfiguredWorkspace();
  const elsewhere = makeTemporaryDirectory();
  mkdirSync(join(elsewhere, 'images'));
  writeFileSync(join(elsewhere, 'images', 'front'), 'ballot image bytes');
  symlinkSync(join(elsewhere, 'images'), join(workspace.path, 'linked-images'));

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });

  // `readdir` doesn't descend into these, so a whole subtree would vanish.
  expect(result).toEqual(
    err({ type: 'unsupported_workspace_entry', path: 'linked-images' })
  );
});
