import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { BaseLogger, LogSource, mockBaseLogger } from '@votingworks/logging';
import { getDiskSpaceSummaries } from '@votingworks/backend';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import {
  authenticateArtifactUsingSignatureFile,
  VXADMIN_BACKUP_MANIFEST_FILE_NAME,
} from '@votingworks/auth';
import { createWorkspace, Workspace } from '../../util/workspace.js';
import { Store } from '../../store.js';
import { createBackup } from './index.js';
import { BackupRoot } from '../backup_root.js';
import { copy } from './copy_step.js';
import { writeManifest } from './manifest_step.js';
import { swap } from './swap_step.js';
import { BackupManifestStructSchema } from '../backup_manifest.js';

vi.mock(
  import('@votingworks/backend'),
  async (importActual): Promise<typeof import('@votingworks/backend')> => {
    const actual = await importActual();
    return {
      ...actual,
      getDiskSpaceSummaries: vi.fn(),
    };
  }
);

vi.mock(
  import('node:fs/promises'),
  async (importActual): Promise<typeof import('node:fs/promises')> => {
    const actual = await importActual();
    return { ...actual, rm: vi.fn(actual.rm) as unknown as typeof rm };
  }
);

vi.mock(
  import('./copy_step.js'),
  async (importActual): Promise<typeof import('./copy_step.js')> => {
    const actual = await importActual();
    return { ...actual, copy: vi.fn(actual.copy) };
  }
);

vi.mock(
  import('./swap_step.js'),
  async (importActual): Promise<typeof import('./swap_step.js')> => {
    const actual = await importActual();
    return { ...actual, swap: vi.fn(actual.swap) };
  }
);

vi.mock(
  import('./manifest_step.js'),
  async (importActual): Promise<typeof import('./manifest_step.js')> => {
    const actual = await importActual();
    return { ...actual, writeManifest: vi.fn(actual.writeManifest) };
  }
);

const GENEROUS_AVAILABLE_KB = 1_000_000_000; // 1 TB, i.e. "don't worry about space"

beforeEach(() => {
  vi.mocked(getDiskSpaceSummaries).mockImplementation((paths) =>
    Promise.resolve(
      paths.map((path) => ({
        path,
        mountpoint: '/',
        total: GENEROUS_AVAILABLE_KB,
        used: 0,
        available: GENEROUS_AVAILABLE_KB,
      }))
    )
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function makeConfiguredWorkspace(): Promise<Workspace> {
  const logger = new BaseLogger(LogSource.VxAdminService);
  const workspace = createWorkspace(makeTemporaryDirectory(), logger);
  const { electionPackage, readElectionDefinition } =
    electionFamousNames2021Fixtures;
  const electionId = await workspace.store.addElection({
    electionData: readElectionDefinition().electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageSourceFilePath: electionPackage.asFilePath(),
    electionPackageHash: createHash('sha256')
      .update(electionPackage.asBuffer())
      .digest('hex'),
  });
  workspace.store.setCurrentElectionId(electionId);
  return workspace;
}

function addCvrWithBallotImage(
  workspace: Workspace,
  { ballotId }: { ballotId: string }
): void {
  const { store } = workspace;
  const electionId = store.getCurrentElectionId();
  if (!electionId) throw new Error('workspace has no current election');
  const electionRecord = store.getElection(electionId);
  if (!electionRecord) throw new Error('current election not found');
  const { election } = electionRecord.electionDefinition;

  const result = store.addCastVoteRecordFileEntry({
    electionId,
    cvrFileId: 'cvr-file-1',
    ballotId,
    cvr: {
      ballotStyleGroupId: election.ballotStyles[0]!.groupId,
      batchId: 'batch-1',
      card: { type: 'bmd' },
      precinctId: election.precincts[0]!.id,
      votes: {},
      votingMethod: 'precinct',
    },
    adjudicationFlags: {
      isBlank: false,
      hasOvervote: false,
      hasUndervote: false,
      hasWriteIn: true,
      hasMarginalMark: false,
      hasCrossoverVote: false,
    },
  });
  if (result.isErr()) {
    throw new Error(`failed to add cvr: ${JSON.stringify(result.err())}`);
  }
  const { cvrId } = result.ok();

  store.addBallotImage({
    cvrId,
    electionDefinitionId: election.id,
    imageData: Buffer.from(`fake-image-data-for-${ballotId}`),
    side: 'front',
  });
}

test('a second backup atomically replaces the first, leaving no leftovers', async () => {
  const workspace = await makeConfiguredWorkspace();
  const electionId = workspace.store.getCurrentElectionId()!;
  workspace.store.addScannerBatch({
    batchId: 'batch-1',
    scannerId: 'scanner-1',
    label: 'Batch 1',
    electionId,
    startedAt: new Date().toISOString(),
  });
  workspace.store.addCastVoteRecordFileRecord({
    id: 'cvr-file-1',
    electionId,
    isTestMode: false,
    filename: 'cvrs.jsonl',
    exportedTimestamp: new Date().toISOString(),
    sha256Hash: 'hash',
    scannerIds: new Set(['scanner-1']),
    pollingPlaceIds: new Set(),
    batchIds: ['batch-1'],
  });
  addCvrWithBallotImage(workspace, { ballotId: 'ballot-1' });

  const target = makeTemporaryDirectory();
  const logger = mockBaseLogger({ fn: vi.fn });

  // Installed after the workspace exists so the last store built is the
  // snapshot's.
  const fileStore = vi.spyOn(Store, 'fileStore');

  const firstResult = await createBackup({
    workspace: workspace.path,
    target,
    logger,
  });
  const firstCreated = firstResult.unsafeUnwrap();

  // The staging area holding the snapshot is deleted once the copy is done, so
  // its connection has to be closed or the space it holds is never reclaimed.
  const snapshotStore = fileStore.mock.results.at(-1)!.value as Store;
  expect(() => snapshotStore.getCurrentElectionId()).toThrow('is closed');
  fileStore.mockRestore();

  const electionRecord = workspace.store.getElection(electionId)!;
  const backupName = generateElectionBasedSubfolderName(
    electionRecord.electionDefinition.election,
    electionRecord.electionDefinition.ballotHash
  );
  const backupPath = new BackupRoot(target).pathFor(backupName);

  // `createBackup` reports where it put the backup, so a caller doesn't have to
  // rebuild the name itself.
  expect(firstCreated.path).toEqual(backupPath);

  function readManifest() {
    return BackupManifestStructSchema.parse(
      JSON.parse(
        readFileSync(
          join(backupPath, VXADMIN_BACKUP_MANIFEST_FILE_NAME),
          'utf-8'
        )
      )
    );
  }

  function authenticateBackup() {
    return authenticateArtifactUsingSignatureFile({
      type: 'vxadmin_backup',
      context: 'import',
      directoryPath: backupPath,
    });
  }

  const firstManifest = readManifest();
  expect(await authenticateBackup()).toEqual(ok());
  const firstBallotImages = readdirSync(
    join(
      backupPath,
      'workspace',
      'ballot-images',
      electionRecord.electionDefinition.election.id
    )
  );
  expect(firstBallotImages).toHaveLength(1);

  // Add a second CVR+image and back up again, into the same target: this
  // exercises the `exchangePaths` swap of an *existing* backup, not just the
  // first-ever plain rename.
  addCvrWithBallotImage(workspace, { ballotId: 'ballot-2' });
  const secondResult = await createBackup({
    workspace: workspace.path,
    target,
    logger,
  });
  expect(secondResult.unsafeUnwrap().path).toEqual(backupPath);

  const secondManifest = readManifest();
  expect(await authenticateBackup()).toEqual(ok());
  expect(secondManifest.createdAt).not.toEqual(firstManifest.createdAt);
  expect(secondManifest.files.length).toBeGreaterThan(
    firstManifest.files.length
  );

  const secondBallotImages = readdirSync(
    join(
      backupPath,
      'workspace',
      'ballot-images',
      electionRecord.electionDefinition.election.id
    )
  );
  expect(secondBallotImages).toHaveLength(2);

  // No `-in-progress` (or old `-previous`) directory left behind.
  expect(readdirSync(dirname(backupPath))).toEqual([backupName]);

  // What `create` wrote is what `list` finds: the two agreed on the layout.
  const listed = (await new BackupRoot(target).listBackups()).unsafeUnwrap();
  expect(listed.map((b) => b.path)).toEqual([backupPath]);
});

function outOfSpaceError(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error('no space left on device');
  error.code = 'ENOSPC';
  return error;
}

test('reports an error when copying the backup fails', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  vi.mocked(copy).mockRejectedValueOnce(outOfSpaceError());

  const result = await createBackup({
    workspace: workspace.path,
    target,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toEqual({
    type: 'backup-write-failed',
    message: 'no space left on device',
  });
});

test('reports an error when writing the manifest fails, leaving no partial backup', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  vi.mocked(writeManifest).mockRejectedValueOnce(outOfSpaceError());

  const result = await createBackup({
    workspace: workspace.path,
    target,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toEqual({
    type: 'backup-write-failed',
    message: 'no space left on device',
  });
  // The backups directory is left, but with nothing in it.
  expect(readdirSync(new BackupRoot(target).pathFor('.'))).toEqual([]);
});

test('fails fast when writing the backup fails unexpectedly', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  vi.mocked(copy).mockRejectedValueOnce(new Error('kaboom'));

  await expect(
    createBackup({
      workspace: workspace.path,
      target,
      logger: mockBaseLogger({ fn: vi.fn }),
    })
  ).rejects.toThrow('kaboom');
});

test('reports an error when clearing a leftover in-progress backup fails', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  const error: NodeJS.ErrnoException = new Error('input/output error');
  error.code = 'EIO';
  const fileStore = vi.spyOn(Store, 'fileStore');

  // `prepare` reclaims the workspace's staging area with `rm` first, so target
  // only the in-progress directory. Restored at the end of the test, since a
  // delegating `vi.fn` is not something `restoreAllMocks` puts back.
  const actualFs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );
  vi.mocked(rm).mockImplementation((path, options) =>
    String(path).endsWith('-in-progress')
      ? Promise.reject(error)
      : actualFs.rm(path, options)
  );

  const result = await createBackup({
    workspace: workspace.path,
    target,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toEqual({
    type: 'backup-write-failed',
    message: 'input/output error',
  });

  // Failing this early must still release the snapshot's connection.
  const snapshotStore = fileStore.mock.results.at(-1)!.value as Store;
  expect(() => snapshotStore.getCurrentElectionId()).toThrow('is closed');

  vi.mocked(rm).mockImplementation(actualFs.rm);
});

test('reports a failed swap rather than a created backup', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  vi.mocked(swap).mockResolvedValueOnce(
    err({ type: 'backup-swap-failed', message: 'could not swap' })
  );

  const result = await createBackup({
    workspace: workspace.path,
    target,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toEqual({
    type: 'backup-swap-failed',
    message: 'could not swap',
  });
});
