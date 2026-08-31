import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { Buffer } from 'node:buffer';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { BaseLogger, LogSource, mockBaseLogger } from '@votingworks/logging';
import { getDiskSpaceSummaries } from '@votingworks/backend';
import { createWorkspace, Workspace } from '../../util/workspace.js';
import { Store } from '../../store.js';
import { BackupStagingArea } from '../staging_area.js';
import { prepare } from './prepare_step.js';

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

/**
 * Adds a single CVR with a ballot image directly via low-level store calls,
 * bypassing the CVR export/import pipeline entirely.
 */
function addCvrWithBallotImage(
  workspace: Workspace,
  { ballotId = 'ballot-1' }: { ballotId?: string } = {}
): { imagePath: string } {
  const { store } = workspace;
  const electionId = store.getCurrentElectionId();
  if (!electionId) throw new Error('workspace has no current election');
  const electionRecord = store.getElection(electionId);
  if (!electionRecord) throw new Error('current election not found');
  const { election } = electionRecord.electionDefinition;

  store.addScannerBatch({
    batchId: 'batch-1',
    scannerId: 'scanner-1',
    label: 'Batch 1',
    electionId,
    startedAt: new Date().toISOString(),
  });
  store.addCastVoteRecordFileRecord({
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
  const { cvrId: insertedCvrId } = result.ok();

  store.addBallotImage({
    cvrId: insertedCvrId,
    electionDefinitionId: election.id,
    imageData: Buffer.from('fake-front-image-data'),
    side: 'front',
  });

  return {
    imagePath: join(
      workspace.store.getBallotImagesPath(),
      election.id,
      `${insertedCvrId}-front`
    ),
  };
}

test('reclaims a killed run’s staging area before measuring free space', async () => {
  const workspace = await makeConfiguredWorkspace();
  addCvrWithBallotImage(workspace);

  // What a run killed mid-copy leaves: a staging area holding a real copy of
  // the database, at the one path a staging area ever occupies.
  const stagingAreaPath = BackupStagingArea.pathIn(workspace.path);
  mkdirSync(join(stagingAreaPath, 'copy-root'), { recursive: true });
  writeFileSync(join(stagingAreaPath, 'copy-root', 'data.db'), 'stale');

  // A killed run's snapshot is a real copy, so it has to be reclaimed before
  // free space is measured or it counts against the space this backup needs.
  let staleBytesAtMeasureTime: number | undefined;
  vi.mocked(getDiskSpaceSummaries).mockImplementation((paths) => {
    staleBytesAtMeasureTime ??= existsSync(
      join(stagingAreaPath, 'copy-root', 'data.db')
    )
      ? 1
      : 0;
    return Promise.resolve(
      paths.map((path) => ({
        path,
        mountpoint: '/',
        total: GENEROUS_AVAILABLE_KB,
        used: 0,
        available: GENEROUS_AVAILABLE_KB,
      }))
    );
  });

  const result = await prepare({
    workspace,
    target: makeTemporaryDirectory(),
    logger: mockBaseLogger({ fn: vi.fn }),
  });
  const { source, snapshotStore: store } = result.unsafeUnwrap();

  expect(staleBytesAtMeasureTime).toEqual(0);

  // The stale copy is gone, replaced by this run's staging area.
  expect(
    readFileSync(join(stagingAreaPath, 'copy-root', 'data.db')).toString()
  ).not.toEqual('stale');

  store.close();
  await source.cleanup();
  expect(existsSync(stagingAreaPath)).toEqual(false);
});

test('refuses while a write transaction is open on the workspace', async () => {
  const workspace = await makeConfiguredWorkspace();

  // What a CVR import looks like from here: it holds its transaction open
  // across awaits for the whole import.
  workspace.store['client'].run('begin transaction');

  const result = await prepare({
    workspace,
    target: makeTemporaryDirectory(),
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toEqual({
    type: 'write-in-progress',
    message:
      'Cannot back up while another operation is writing to the database',
  });

  workspace.store['client'].run('rollback');
});

test('refuses when a write begins after the snapshot is cleared to start', async () => {
  const workspace = await makeConfiguredWorkspace();
  const dbClient = workspace.store['client'];

  // Slip the write in after `prepare` checks, to stand in for the window
  // between the check and the snapshot actually starting. It takes a real
  // write, not just an open transaction, for SQLite to hold the write lock
  // that makes the snapshot a no-op.
  vi.spyOn(dbClient, 'isInTransaction').mockImplementationOnce(() => {
    dbClient.run('begin transaction');
    dbClient.run('update elections set election_data = election_data');
    return false;
  });

  const result = await prepare({
    workspace,
    target: makeTemporaryDirectory(),
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toEqual({
    type: 'write-in-progress',
    message:
      'Cannot back up while another operation is writing to the database',
  });

  dbClient.run('rollback');
});

test('refuses when a backup of the workspace is already running', async () => {
  const workspace = await makeConfiguredWorkspace();
  const held = (
    await BackupStagingArea.inWorkspace(workspace.path)
  ).unsafeUnwrap();

  const result = await prepare({
    workspace,
    target: makeTemporaryDirectory(),
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toEqual({
    type: 'backup-in-progress',
    message: 'Another backup of this workspace is already running',
  });

  await held.cleanup();
});

test('fails when no election is configured', async () => {
  const logger = new BaseLogger(LogSource.VxAdminService);
  const workspace = createWorkspace(makeTemporaryDirectory(), logger);

  const result = await prepare({
    workspace,
    target: makeTemporaryDirectory(),
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toEqual({
    type: 'unconfigured',
    message: 'An unconfigured VxAdmin cannot be backed up',
  });
});

test('fails when the backup target directory does not exist', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = join(makeTemporaryDirectory(), 'not-mounted');

  const result = await prepare({
    workspace,
    target,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toEqual({
    type: 'file-not-found',
    path: target,
    message: 'Backup target directory could not be found',
  });
});

test('fails when the backup target is not a directory', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = join(makeTemporaryDirectory(), 'target-file');
  writeFileSync(target, 'not a directory');

  const result = await prepare({
    workspace,
    target,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toEqual({
    type: 'not-directory',
    path: target,
    message: `${target} is not a directory`,
  });
});

test('fails when the backup target goes away while staging', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  vi.mocked(getDiskSpaceSummaries).mockImplementation((paths) => {
    if (paths.includes(target)) {
      // How an unplugged drive shows up: `df` exits non-zero, and the error
      // carries that exit code rather than an ENOENT.
      rmSync(target, { recursive: true, force: true });
      const error: NodeJS.ErrnoException = new Error('df exited with code 1');
      error.code = '1';
      return Promise.reject(error);
    }
    return Promise.resolve(
      paths.map((path) => ({
        path,
        mountpoint: '/',
        total: GENEROUS_AVAILABLE_KB,
        used: 0,
        available: GENEROUS_AVAILABLE_KB,
      }))
    );
  });

  const result = await prepare({
    workspace,
    target,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toEqual({
    type: 'file-not-found',
    path: target,
    message: 'Backup target directory could not be found',
  });
});

test('fails fast when the target disk space check fails for another reason', async () => {
  const workspace = await makeConfiguredWorkspace();
  const target = makeTemporaryDirectory();
  vi.mocked(getDiskSpaceSummaries).mockImplementation((paths) =>
    paths.includes(target)
      ? Promise.reject(new Error('df is broken'))
      : Promise.resolve(
          paths.map((path) => ({
            path,
            mountpoint: '/',
            total: GENEROUS_AVAILABLE_KB,
            used: 0,
            available: GENEROUS_AVAILABLE_KB,
          }))
        )
  );

  await expect(
    prepare({
      workspace,
      target,
      logger: mockBaseLogger({ fn: vi.fn }),
    })
  ).rejects.toThrow('df is broken');
});

test('fails with insufficient-workspace-storage when the workspace volume is too full', async () => {
  const workspace = await makeConfiguredWorkspace();
  vi.mocked(getDiskSpaceSummaries).mockImplementation((paths) =>
    Promise.resolve(
      paths.map((path) => ({
        path,
        mountpoint: '/',
        total: 100,
        used: 99,
        available: path === workspace.path ? 1 : GENEROUS_AVAILABLE_KB,
      }))
    )
  );

  const result = await prepare({
    workspace,
    target: makeTemporaryDirectory(),
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toMatchObject({
    type: 'insufficient-workspace-storage',
  });
});

test('fails with insufficient-target-storage when the target volume is too full', async () => {
  const workspace = await makeConfiguredWorkspace();
  addCvrWithBallotImage(workspace);
  const target = makeTemporaryDirectory();
  vi.mocked(getDiskSpaceSummaries).mockImplementation((paths) =>
    Promise.resolve(
      paths.map((path) => ({
        path,
        mountpoint: '/',
        total: 100,
        used: 99,
        available: path === target ? 1 : GENEROUS_AVAILABLE_KB,
      }))
    )
  );

  // Installed after the workspace exists so the last store built is the
  // snapshot's.
  const fileStore = vi.spyOn(Store, 'fileStore');

  const result = await prepare({
    workspace,
    target,
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toMatchObject({ type: 'insufficient-target-storage' });

  // The snapshot it staged is deleted on this path, so its connection has to
  // be closed or the space it holds is never reclaimed.
  const snapshotStore = fileStore.mock.results.at(-1)!.value as Store;
  expect(() => snapshotStore.getCurrentElectionId()).toThrow('is closed');
});

test('stages a database snapshot, election package, and ballot images', async () => {
  const workspace = await makeConfiguredWorkspace();
  const { imagePath } = addCvrWithBallotImage(workspace);
  const progressEvents: Array<{ type: string }> = [];

  const result = await prepare({
    workspace,
    target: makeTemporaryDirectory(),
    logger: mockBaseLogger({ fn: vi.fn }),
    onProgressEvent: (event) => progressEvents.push(event),
  });

  const { source: stagingArea } = result.unsafeUnwrap();
  const stagedPaths = stagingArea.listStagedFiles().map((file) => file.path);

  expect(stagedPaths.some((p) => p.endsWith('data.db'))).toEqual(true);
  expect(
    stagedPaths.some((p) =>
      p.endsWith(`${workspace.store.getCurrentElectionId()}.zip`)
    )
  ).toEqual(true);
  expect(stagedPaths.some((p) => p.endsWith('-front'))).toEqual(true);

  expect(progressEvents.map((e) => e.type)).toContain('db_snapshot');
  expect(progressEvents.map((e) => e.type)).toContain('staging_files');

  await stagingArea.cleanup();
  // the original file must be untouched by staging
  expect(readFileSync(imagePath)).toEqual(Buffer.from('fake-front-image-data'));
});

test('fails loudly when a referenced ballot image is missing from disk', async () => {
  const workspace = await makeConfiguredWorkspace();
  const { imagePath } = addCvrWithBallotImage(workspace);

  // Simulate a concurrent deletion: the `ballot_images` row (captured by the
  // database snapshot) still exists, but the underlying file is gone.
  unlinkSync(imagePath);

  const result = await prepare({
    workspace,
    target: makeTemporaryDirectory(),
    logger: mockBaseLogger({ fn: vi.fn }),
  });

  expect(result.err()).toMatchObject({
    type: 'file-not-found',
    path: imagePath,
  });
});
