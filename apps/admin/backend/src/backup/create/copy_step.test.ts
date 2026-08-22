import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import {
  DEFAULT_SYSTEM_SETTINGS,
  DEV_MACHINE_ID,
  LATEST_SOFTWARE_VERSION,
} from '@votingworks/types';
import { BaseLogger, LogSource, mockBaseLogger } from '@votingworks/logging';
import { getDiskSpaceSummaries } from '@votingworks/backend';
import { createWorkspace, Workspace } from '../../util/workspace.js';
import { prepare } from './prepare_step.js';
import { copy } from './copy_step.js';
import { ProgressEvent } from './types.js';

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
): void {
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
}

test('copies staged files to the backup directory and builds a manifest', async () => {
  const workspace = await makeConfiguredWorkspace();
  addCvrWithBallotImage(workspace);

  const prepareResult = await prepare({
    workspace: workspace.path,
    target: makeTemporaryDirectory(),
    logger: mockBaseLogger({ fn: vi.fn }),
  });
  const { source, store, electionRecord } = prepareResult.unsafeUnwrap();

  const backupPath = join(makeTemporaryDirectory(), 'backup');
  const progressEvents: ProgressEvent[] = [];

  const manifest = await copy({
    source,
    store,
    electionRecord,
    backup: backupPath,
    logger: mockBaseLogger({ fn: vi.fn }),
    onProgressEvent: (event) => progressEvents.push(event),
  });

  // Every staged file landed at `<backup>/<relativePath>` with the exact
  // bytes it had in the staging area, and the manifest describes it
  // accurately.
  const stagedFiles = source.listStagedFiles();
  expect(manifest.files).toHaveLength(stagedFiles.length);
  for (const stagedFile of stagedFiles) {
    const entry = manifest.files.find(
      (file) => file.path === join('workspace', stagedFile.relativePath)
    );
    expect(entry).toBeDefined();

    const copiedBytes = readFileSync(join(backupPath, entry!.path));
    expect(copiedBytes).toEqual(readFileSync(stagedFile.path));
    expect(entry!.size).toEqual(copiedBytes.length);
    expect(entry!.hash).toEqual(
      createHash('sha256').update(copiedBytes).digest('hex')
    );
  }

  expect(manifest.machineId).toEqual(DEV_MACHINE_ID);
  expect(manifest.softwareVersion).toEqual(LATEST_SOFTWARE_VERSION);
  expect(manifest.election).toEqual({
    id: electionRecord.electionDefinition.election.id,
    title: electionRecord.electionDefinition.election.title,
    date: electionRecord.electionDefinition.election.date,
  });

  // Progress events bracket the copy with 0/total and total/total, and each
  // in-between event names the file currently being copied.
  expect(progressEvents.at(0)).toMatchObject({
    type: 'copy_files',
    copiedCount: 0,
    totalCount: stagedFiles.length,
  });
  expect(progressEvents.at(-1)).toMatchObject({
    type: 'copy_files',
    copiedCount: stagedFiles.length,
    totalCount: stagedFiles.length,
  });
  const namedFiles = progressEvents
    .filter((event) => event.type === 'copy_files' && event.current)
    .map((event) => (event as { current: string }).current);
  expect(namedFiles.toSorted()).toEqual(
    stagedFiles.map((file) => file.relativePath).toSorted()
  );

  await source.cleanup();
});
