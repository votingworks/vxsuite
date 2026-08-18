// What a backup does when something goes wrong: what it refuses before
// touching the drive, what it reports when a step fails part way through, and
// what it recovers from a run that never finished.

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { rm as realRm } from 'node:fs/promises';
import { join } from 'node:path';
import { getDiskSpaceSummary } from '@votingworks/backend';
import { exchangePaths } from '@votingworks/fs';
import { syncFilesystem } from '@votingworks/usb-drive';
import { err, ok } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import {
  BackupError,
  createBackup,
  formatBackupError,
} from './create_backup.js';
import { rm } from './fs.js';
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
  return { ...actual, rm: vi.fn(actual.rm) };
});

// The swap goes through `@votingworks/fs`, whose operations report failure by
// returning an error rather than throwing, so a test can make the swap fail
// the same way.
vi.mock('@votingworks/fs', async (importActual) => {
  const actual = await importActual<typeof import('@votingworks/fs')>();
  return { ...actual, exchangePaths: vi.fn(actual.exchangePaths) };
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
  vi.mocked(rm).mockImplementation(realRm);
  vi.mocked(exchangePaths).mockReset();
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
      type: 'target_unsupported_filesystem',
      path: '/media/usb',
      message: 'EINVAL',
    },
    expectedMessage: 'formatted with ext4',
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

test('refuses a drive whose filesystem cannot swap backups, before copying anything', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const testLogger = mockLogger();

  // What `renameat2(RENAME_EXCHANGE)` returns on a filesystem that doesn't
  // support it, e.g. FAT32. The plain rename that takes a free name works
  // everywhere, so without the up-front probe this drive would accept its
  // first backup and then fail every later one — after all the copying.
  vi.mocked(exchangePaths).mockReturnValue(
    err({ code: 'EINVAL', message: 'EINVAL: Invalid argument' })
  );

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: testLogger,
  });

  expect(result).toEqual(
    err({
      type: 'target_unsupported_filesystem',
      path: target,
      message: expect.stringContaining('EINVAL'),
    })
  );
  // Failed before copying, and the probe cleaned up after itself.
  expect(loggedSteps(testLogger)).toEqual(['checking_space']);
  expect(readdirSync(join(target, BACKUPS_DIRECTORY_NAME))).toEqual([]);
});

test('a probe that fails some other way reports the drive as unusable', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();

  vi.mocked(exchangePaths).mockReturnValue(
    err({ code: 'EIO', message: 'EIO: i/o error' })
  );

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });

  // An I/O error isn't a verdict on the filesystem, and telling someone to
  // reformat a drive that is failing would be bad advice.
  expect(result).toEqual(
    err({
      type: 'target_unusable',
      path: target,
      message: expect.stringContaining('EIO'),
    })
  );
});

test('replaces whatever is squatting on the backup name', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  // Not a backup, just something under the backup's name — say, a directory a
  // person made by hand. The swap exchanges it out and deletes it like any
  // replaced backup.
  mkdirSync(backupDirectoryPath, { recursive: true });
  writeFileSync(join(backupDirectoryPath, 'junk'), 'junk');

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: mockLogger(),
  });
  result.unsafeUnwrap();

  expect((await validateBackup({ backupDirectoryPath })).err()).toBeUndefined();
  expect(existsSync(join(backupDirectoryPath, 'junk'))).toEqual(false);
  expect(() => statSync(`${backupDirectoryPath}-in-progress`)).toThrow();
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

test('a failed swap leaves the old backup in place under its own name', async () => {
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

  // The up-front probe passes — the drive supports the operation — and the
  // swap itself fails, the way a drive dying mid-run would.
  vi.mocked(exchangePaths).mockImplementation((pathA) =>
    pathA.includes('.exchange-probe')
      ? ok()
      : err({ code: 'EIO', message: 'EIO: i/o error, rename' })
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

  // A failed exchange moves nothing, so the old backup never left the name
  // `list` and a restore look for, and the new copy is cleaned up.
  const survivor = (
    await validateBackup({ backupDirectoryPath })
  ).unsafeUnwrap();
  expect(survivor.createdAt).toEqual(firstManifest.createdAt);
  expect(existsSync(`${backupDirectoryPath}-in-progress`)).toEqual(false);
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

  // Make deleting last time's copy fail after the exchange has succeeded, by
  // which point the new backup is already the one on the drive and the old one
  // sits under the `-in-progress` name.
  let swapped = false;
  vi.mocked(rm).mockImplementation((path, options) =>
    swapped && String(path).endsWith('-in-progress')
      ? Promise.reject(new Error('EIO'))
      : realRm(path, options)
  );

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: testLogger,
    onProgress: ({ step }) => {
      // The cleanup at the start of a run deletes `-in-progress` too; only the
      // one after the swap is of interest.
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

test('records the swap as the stage a failed exchange reached', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const testLogger = mockLogger();

  (
    await createBackup({
      workspace,
      targetDirectoryPath: target,
      machineConfig: MACHINE_CONFIG,
      logger: mockLogger(),
    })
  ).unsafeUnwrap();

  vi.mocked(exchangePaths).mockImplementation((pathA) =>
    pathA.includes('.exchange-probe')
      ? ok()
      : err({ code: 'EIO', message: 'EIO: i/o error, rename' })
  );

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig: MACHINE_CONFIG,
    logger: testLogger,
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
