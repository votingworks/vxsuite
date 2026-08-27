import { vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import { DEFAULT_SYSTEM_SETTINGS, Id } from '@votingworks/types';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { getDiskSpaceSummaries } from '@votingworks/backend';
import { createWorkspace, Workspace } from '../src/util/workspace.js';

/**
 * A volume with so much free space that a test using it never has to think
 * about storage limits.
 */
export const GENEROUS_AVAILABLE_KB = 1_000_000_000; // 1 TB

/**
 * Mocks {@link getDiskSpaceSummaries}, reporting `availableKb` free kilobytes
 * for each queried path. Requires the calling test file to have mocked
 * `@votingworks/backend`.
 */
export function mockDiskSpace(
  availableKb: (path: string) => number = () => GENEROUS_AVAILABLE_KB
): void {
  vi.mocked(getDiskSpaceSummaries).mockImplementation((paths) =>
    Promise.resolve(
      paths.map((path) => ({
        path,
        mountpoint: '/',
        total: GENEROUS_AVAILABLE_KB,
        used: 0,
        available: availableKb(path),
      }))
    )
  );
}

/**
 * Creates a workspace in a temporary directory configured with the famous
 * names election as its current election.
 */
export async function makeConfiguredWorkspace(): Promise<Workspace> {
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
 * What {@link addCvrWithBallotImage} added.
 */
export interface AddedCvrWithBallotImage {
  cvrId: Id;

  /**
   * Where the ballot image was written within the workspace.
   */
  imagePath: string;

  /**
   * The ballot image's contents, unique to this `ballotId`.
   */
  imageData: Buffer;
}

/**
 * Adds a single CVR with a ballot image directly via low-level store calls,
 * bypassing the CVR export/import pipeline entirely. Each `ballotId` gets its
 * own batch and CVR file, so this may be called repeatedly to build up a
 * workspace with several images.
 */
export function addCvrWithBallotImage(
  workspace: Workspace,
  { ballotId = 'ballot-1' }: { ballotId?: string } = {}
): AddedCvrWithBallotImage {
  const { store } = workspace;
  const electionId = store.getCurrentElectionId();
  if (!electionId) throw new Error('workspace has no current election');
  const electionRecord = store.getElection(electionId);
  if (!electionRecord) throw new Error('current election not found');
  const { election } = electionRecord.electionDefinition;
  const batchId = `batch-for-${ballotId}`;
  const cvrFileId = `cvr-file-for-${ballotId}`;

  store.addScannerBatch({
    batchId,
    scannerId: 'scanner-1',
    label: 'Batch 1',
    electionId,
    startedAt: new Date().toISOString(),
  });
  store.addCastVoteRecordFileRecord({
    id: cvrFileId,
    electionId,
    isTestMode: false,
    filename: 'cvrs.jsonl',
    exportedTimestamp: new Date().toISOString(),
    sha256Hash: 'hash',
    scannerIds: new Set(['scanner-1']),
    pollingPlaceIds: new Set(),
    batchIds: [batchId],
  });
  const result = store.addCastVoteRecordFileEntry({
    electionId,
    cvrFileId,
    ballotId,
    cvr: {
      ballotStyleGroupId: assertDefined(election.ballotStyles[0]).groupId,
      batchId,
      card: { type: 'bmd' },
      precinctId: assertDefined(election.precincts[0]).id,
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

  const imageData = Buffer.from(`fake-front-image-data-for-${ballotId}`);
  store.addBallotImage({
    cvrId,
    electionDefinitionId: election.id,
    imageData,
    side: 'front',
  });

  return {
    cvrId,
    imagePath: join(store.getBallotImagesPath(), election.id, `${cvrId}-front`),
    imageData,
  };
}
