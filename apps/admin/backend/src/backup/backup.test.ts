import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  prepareSignatureFile,
  SIGNATURE_FILE_EXTENSION,
} from '@votingworks/auth';
import { getDiskSpaceSummary, syncFilesystem } from '@votingworks/backend';
import { assertDefined, err, ok } from '@votingworks/basics';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  LogEventId,
  mockBaseLogger,
  MockBaseLogger,
} from '@votingworks/logging';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import {
  BackupError,
  BackupStep,
  createBackup,
  formatBackupError,
} from './create_backup.js';
import {
  BACKUPS_DIRECTORY_NAME,
  backupFilePath,
  BackupManifest,
  isTransientBackupDirectoryName,
  manifestPath,
  readManifest,
  WORKSPACE_DIRECTORY_NAME,
} from './manifest.js';
import {
  BackupValidationError,
  BackupValidationProgress,
  formatBackupValidationError,
  validateBackup,
} from './validate_backup.js';
import { createWorkspace, Workspace } from '../util/workspace.js';
import { MachineConfig } from '../types.js';
import {
  BALLOT_IMAGE_CONTENTS,
  BALLOT_IMAGE_PATH,
  makeConfiguredWorkspace,
} from '../../test/backup.js';

// `vi.spyOn` can't touch `node:fs/promises` exports under ESM, so the two tests
// that need a failing filesystem call swap in an override here.
type RmFn = (path: unknown, options?: unknown) => Promise<void>;

const overrides = vi.hoisted(() => ({
  rm: undefined as undefined | RmFn,
  readManifestContents: undefined as
    | undefined
    | ((path: unknown) => Promise<unknown>),
  realRm: undefined as undefined | RmFn,
}));

vi.mock('node:fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('node:fs/promises')>();
  overrides.realRm = actual.rm as never;
  return {
    ...actual,
    rm: (...args: Parameters<typeof actual.rm>) =>
      overrides.rm ? overrides.rm(args[0], args[1]) : actual.rm(...args),
  };
});

// Reading the manifest is intercepted here rather than at the filesystem,
// because `libs/auth` reads the same file to check the signature and a
// filesystem-level override would tamper with that instead.
vi.mock('./manifest.js', async (importActual) => {
  const actual = await importActual<typeof import('./manifest.js')>();
  return {
    ...actual,
    readManifestContents: (
      ...args: Parameters<typeof actual.readManifestContents>
    ) =>
      overrides.readManifestContents
        ? overrides.readManifestContents(args[0])
        : actual.readManifestContents(...args),
  };
});

vi.mock(
  '@votingworks/backend',
  async (importActual): Promise<typeof import('@votingworks/backend')> => ({
    ...(await importActual<typeof import('@votingworks/backend')>()),
    getDiskSpaceSummary: vi.fn(),
    syncFilesystem: vi.fn(),
  })
);

const electionDefinition = readElectionGeneralDefinition();

const machineConfig: MachineConfig = {
  machineId: 'AD-1234',
  codeVersion: '1.2.3',
};

function logger() {
  return mockBaseLogger({ fn: vi.fn });
}

function makeUnconfiguredWorkspace(): Workspace {
  return createWorkspace(makeTemporaryDirectory(), logger());
}

function loggedSteps(log: MockBaseLogger): BackupStep[] {
  return vi
    .mocked(log.log)
    .mock.calls.filter(
      ([eventId]) => eventId === LogEventId.BackupCreateProgress
    )
    .map(([, , logData]) => (logData as { step: BackupStep }).step);
}

function expectedBackupDirectoryName(): string {
  return generateElectionBasedSubfolderName(
    electionDefinition.election,
    electionDefinition.ballotHash
  );
}

afterEach(() => {
  overrides.rm = undefined;
  overrides.readManifestContents = undefined;
});

beforeEach(() => {
  // 1 TB free everywhere, in the 1K blocks `df` reports.
  vi.mocked(getDiskSpaceSummary).mockResolvedValue({
    total: 1_000_000_000,
    used: 0,
    available: 1_000_000_000,
  });
  vi.mocked(syncFilesystem).mockResolvedValue();
});

test('creates a signed backup that validates', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const steps: BackupStep[] = [];

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig,
    logger: logger(),
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

test('logs each stage once, however many files it copies', async () => {
  const workspace = await makeConfiguredWorkspace();
  const testLogger = logger();
  let copyingFilesUpdates = 0;

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig,
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

test('a failed backup records the stage it got to', async () => {
  const workspace = await makeConfiguredWorkspace();
  const testLogger = logger();
  vi.mocked(syncFilesystem).mockRejectedValue(new Error('drive went away'));

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig,
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

test('a second backup replaces the first, leaving no transient directories', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();

  const first = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig,
    logger: logger(),
  });
  first.unsafeUnwrap();

  writeFileSync(join(workspace.path, BALLOT_IMAGE_PATH), 'different bytes');

  const second = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig,
    logger: logger(),
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
      machineConfig,
      logger: logger(),
    })
  ).unsafeUnwrap();

  expect(backupWasVisible).toEqual([false, true]);
});

test('fails when the drive cannot be flushed', async () => {
  const workspace = await makeConfiguredWorkspace();
  vi.mocked(syncFilesystem).mockRejectedValue(new Error('drive went away'));

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig,
    logger: logger(),
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
    machineConfig,
    logger: logger(),
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
    machineConfig,
    logger: logger(),
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
      machineConfig,
      logger: logger(),
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
    machineConfig,
    logger: logger(),
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
    machineConfig,
    logger: logger(),
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
      machineConfig,
      logger: logger(),
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
    machineConfig,
    logger: logger(),
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
    machineConfig,
    logger: logger(),
  });
  const firstManifest = first.unsafeUnwrap().manifest;

  const second = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig,
    logger: logger(),
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

async function createValidBackup(): Promise<{
  backupDirectoryPath: string;
  manifest: BackupManifest;
}> {
  const workspace = await makeConfiguredWorkspace();
  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig,
    logger: logger(),
  });
  return result.unsafeUnwrap();
}

test('validation reports progress as it verifies each file', async () => {
  const { backupDirectoryPath, manifest } = await createValidBackup();
  const bytesTotal = manifest.files.reduce((sum, file) => sum + file.size, 0);
  const updates: BackupValidationProgress[] = [];

  const result = await validateBackup({
    backupDirectoryPath,
    onProgress: (progress) => updates.push(progress),
  });
  result.unsafeUnwrap();

  // One update before any file is read, so a caller can show the total up
  // front, then one per file verified.
  expect(updates).toHaveLength(manifest.files.length + 1);
  expect(updates[0]).toEqual({ bytesCompleted: 0, bytesTotal });
  expect(updates[updates.length - 1]).toEqual({
    bytesCompleted: bytesTotal,
    bytesTotal,
  });
});

test('validation rejects a backup whose manifest cannot be read', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  rmSync(manifestPath(backupDirectoryPath));

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'manifest_unreadable',
      message: expect.stringContaining('ENOENT'),
    })
  );
});

test('validation rejects a manifest that has been edited', async () => {
  const { backupDirectoryPath, manifest } = await createValidBackup();
  writeFileSync(
    manifestPath(backupDirectoryPath),
    JSON.stringify({ ...manifest, machineId: 'AD-9999' })
  );

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'signature_invalid',
      message: expect.stringContaining('Verification failure'),
    })
  );
});

test('validation rejects a backup made by different software', async () => {
  const { backupDirectoryPath } = await createValidBackup();

  const result = await validateBackup({
    backupDirectoryPath,
    expectedSoftwareVersion: '9.9.9',
  });
  expect(result).toEqual(
    err({
      type: 'software_version_mismatch',
      expectedSoftwareVersion: '9.9.9',
      actualSoftwareVersion: '1.2.3',
    })
  );
});

test('validation rejects a backup with a missing file', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  rmSync(backupFilePath(backupDirectoryPath, BALLOT_IMAGE_PATH));

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'file_missing',
      path: BALLOT_IMAGE_PATH,
    })
  );
});

test('validation rejects a backup with a resized file', async () => {
  const { backupDirectoryPath, manifest } = await createValidBackup();
  const file = assertDefined(
    manifest.files.find((f) => f.path === BALLOT_IMAGE_PATH)
  );
  writeFileSync(
    backupFilePath(backupDirectoryPath, BALLOT_IMAGE_PATH),
    'short'
  );

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'file_size_mismatch',
      path: BALLOT_IMAGE_PATH,
      expectedSize: file.size,
      actualSize: 5,
    })
  );
});

test('validation rejects a backup with an altered file', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  writeFileSync(
    backupFilePath(backupDirectoryPath, BALLOT_IMAGE_PATH),
    'ballot image bytez'
  );

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'file_hash_mismatch',
      path: BALLOT_IMAGE_PATH,
      expectedSha256: expect.any(String),
      actualSha256: expect.any(String),
    })
  );
});

test('validation rejects a backup with a file the manifest does not list', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  writeFileSync(join(backupDirectoryPath, 'surprise.txt'), 'hello');

  const result = await validateBackup({ backupDirectoryPath });
  expect(result).toEqual(
    err({
      type: 'unexpected_file',
      path: 'surprise.txt',
    })
  );
});

test('the signature file is inside the backup directory', async () => {
  const { backupDirectoryPath } = await createValidBackup();
  expect(
    statSync(
      `${manifestPath(backupDirectoryPath)}${SIGNATURE_FILE_EXTENSION}`
    ).isFile()
  ).toEqual(true);
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

test.each<{ error: BackupValidationError; expectedMessage: string }>([
  {
    error: { type: 'manifest_unreadable', message: 'ENOENT' },
    expectedMessage: 'manifest could not be read',
  },
  {
    error: { type: 'signature_invalid', message: 'bad' },
    expectedMessage: 'signature is not valid',
  },
  {
    error: { type: 'manifest_version_unsupported', version: 2 },
    expectedMessage: 'format version 2',
  },
  {
    error: {
      type: 'software_version_mismatch',
      expectedSoftwareVersion: '2',
      actualSoftwareVersion: '1',
    },
    expectedMessage: 'this machine is running 2',
  },
  {
    error: { type: 'file_missing', path: 'data.db' },
    expectedMessage: 'missing data.db',
  },
  {
    error: {
      type: 'file_size_mismatch',
      path: 'data.db',
      expectedSize: 2,
      actualSize: 1,
    },
    expectedMessage: 'should be 2 bytes',
  },
  {
    error: {
      type: 'file_hash_mismatch',
      path: 'data.db',
      expectedSha256: 'a',
      actualSha256: 'b',
    },
    expectedMessage: 'does not match the hash',
  },
  {
    error: { type: 'manifest_changed' },
    expectedMessage: 'changed while it was being checked',
  },
  {
    error: { type: 'unexpected_file', path: 'extra' },
    expectedMessage: 'manifest does not list',
  },
])('formats validation error $error.type', ({ error, expectedMessage }) => {
  expect(formatBackupValidationError(error)).toContain(expectedMessage);
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
    machineConfig,
    logger: logger(),
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
    machineConfig,
    logger: logger(),
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
      machineConfig,
      logger: logger(),
    })
  ).unsafeUnwrap();

  // A leftover beside a good backup is a partial write, not something to
  // promote over the backup that is already there.
  mkdirSync(`${backupDirectoryPath}-previous`);
  writeFileSync(join(`${backupDirectoryPath}-previous`, 'junk'), 'junk');

  const second = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig,
    logger: logger(),
  });
  second.unsafeUnwrap();
  expect(() => statSync(`${backupDirectoryPath}-previous`)).toThrow();
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
    machineConfig,
    logger: logger(),
  });

  const { manifest } = result.unsafeUnwrap();
  expect(manifest.files.map((file) => file.path)).not.toContain(
    'data.db-journal'
  );
});

test('reports an unreadable workspace instead of throwing', async () => {
  const workspace = await makeConfiguredWorkspace();
  const testLogger = logger();
  rmSync(workspace.path, { recursive: true, force: true });

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig,
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
    machineConfig,
    logger: logger(),
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
    machineConfig,
    logger: logger(),
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
  const testLogger = logger();
  // The first flush, before validation, succeeds; the one after the rename
  // fails — by which point the backup is complete and under its final name.
  vi.mocked(syncFilesystem)
    .mockResolvedValueOnce()
    .mockRejectedValue(new Error('drive went away'));

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig,
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
      machineConfig,
      logger: logger(),
    })
  ).unsafeUnwrap();

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig,
    logger: logger(),
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

test('validation rejects a manifest format it does not understand', async () => {
  const { backupDirectoryPath, manifest } = await createValidBackup();

  // Signed, as a manifest written by later software would be: the point is
  // that a backup can be perfectly authentic and still be unreadable here.
  const manifestFileContents = JSON.stringify({ ...manifest, version: 2 });
  writeFileSync(manifestPath(backupDirectoryPath), manifestFileContents);
  const signatureFile = await prepareSignatureFile({
    type: 'vxadmin_backup',
    context: 'export',
    manifestFileContents,
  });
  writeFileSync(
    join(backupDirectoryPath, signatureFile.fileName),
    signatureFile.fileContents
  );

  const result = await validateBackup({ backupDirectoryPath });

  // Not a signature failure: this is about a backup we cannot claim to have
  // checked, even if it were signed.
  expect(result.err()).toEqual(
    expect.objectContaining({
      type: 'manifest_version_unsupported',
      version: 2,
    })
  );
});

test('the copy reaches the end of its progress bar', async () => {
  const workspace = await makeConfiguredWorkspace();
  let lastCopying: { bytesCompleted: number; bytesTotal: number } | undefined;

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig,
    logger: logger(),
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
    manifest.files.reduce((sum, file) => sum + file.size, 0)
  );
});

test('a backup whose old copy cannot be deleted is still a backup', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const testLogger = logger();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  (
    await createBackup({
      workspace,
      targetDirectoryPath: target,
      machineConfig,
      logger: logger(),
    })
  ).unsafeUnwrap();

  // Make deleting last time's copy fail after both renames have succeeded, by
  // which point the new backup is already the one on the drive.
  let swapped = false;
  overrides.rm = (path, options) => {
    if (
      swapped &&
      String(path).endsWith('-previous') &&
      (options as { recursive?: boolean } | undefined)?.recursive
    ) {
      return Promise.reject(new Error('EIO'));
    }
    return assertDefined(overrides.realRm)(path, options);
  };

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig,
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

test('records the swap as the stage a failed rename reached', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const testLogger = logger();
  const backupDirectoryPath = join(
    target,
    BACKUPS_DIRECTORY_NAME,
    expectedBackupDirectoryName()
  );

  (
    await createBackup({
      workspace,
      targetDirectoryPath: target,
      machineConfig,
      logger: logger(),
    })
  ).unsafeUnwrap();

  const result = await createBackup({
    workspace,
    targetDirectoryPath: target,
    machineConfig,
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

test('validation rejects a manifest path that climbs out of the backup', async () => {
  const { backupDirectoryPath, manifest } = await createValidBackup();
  const escaping: BackupManifest = {
    ...manifest,
    files: [
      { ...assertDefined(manifest.files[0]), path: '../../etc/hostname' },
    ],
  };
  const manifestFileContents = JSON.stringify(escaping);
  writeFileSync(manifestPath(backupDirectoryPath), manifestFileContents);
  const signatureFile = await prepareSignatureFile({
    type: 'vxadmin_backup',
    context: 'export',
    manifestFileContents,
  });
  writeFileSync(
    join(backupDirectoryPath, signatureFile.fileName),
    signatureFile.fileContents
  );

  // Signed, so the signature check passes: the schema is what has to stop this,
  // because restore writes every path a manifest lists.
  expect((await validateBackup({ backupDirectoryPath })).err()).toEqual(
    expect.objectContaining({ type: 'manifest_unreadable' })
  );
});

test.each(['/etc/hostname', 'a/../../b', 'a//b', 'a/./b', 'a\\b', ''])(
  'rejects the manifest path %o',
  async (path) => {
    const { backupDirectoryPath, manifest } = await createValidBackup();
    writeFileSync(
      manifestPath(backupDirectoryPath),
      JSON.stringify({ ...manifest, files: [{ path, sha256: 'a', size: 0 }] })
    );
    expect(await readManifest(backupDirectoryPath)).toEqual(
      err(expect.anything())
    );
  }
);

test('validation rejects a manifest that changes while it is checked', async () => {
  const { backupDirectoryPath, manifest } = await createValidBackup();
  let reads = 0;
  overrides.readManifestContents = () => {
    reads += 1;
    // The real bytes first, different bytes on the read that happens after the
    // signature has been checked — the drive that answers twice differently.
    return Promise.resolve(
      ok(
        reads > 1
          ? JSON.stringify({ ...manifest, machineId: 'AD-9999' })
          : JSON.stringify(manifest)
      )
    );
  };

  const result = await validateBackup({ backupDirectoryPath });

  expect(result.err()).toEqual({ type: 'manifest_changed' });
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
    machineConfig,
    logger: logger(),
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

test('refuses to back up a workspace containing a symbolic link', async () => {
  const workspace = await makeConfiguredWorkspace();
  const elsewhere = makeTemporaryDirectory();
  writeFileSync(join(elsewhere, 'relocated'), 'ballot image bytes');
  symlinkSync(join(elsewhere, 'relocated'), join(workspace.path, 'linked'));

  const result = await createBackup({
    workspace,
    targetDirectoryPath: makeTemporaryDirectory(),
    machineConfig,
    logger: logger(),
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
    machineConfig,
    logger: logger(),
  });

  // `readdir` doesn't descend into these, so a whole subtree would vanish.
  expect(result).toEqual(
    err({ type: 'unsupported_workspace_entry', path: 'linked-images' })
  );
});
