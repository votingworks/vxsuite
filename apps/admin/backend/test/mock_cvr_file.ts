import {
  BallotPageLayout,
  BallotStyleId,
  BallotType,
  ContestId,
  ContestOptionId,
  Id,
  Tabulation,
} from '@votingworks/types';
import { v4 as uuid } from 'uuid';
import { Buffer } from 'node:buffer';
import { assertDefined } from '@votingworks/basics';
import { Store } from '../src/store';
import { getCastVoteRecordAdjudicationFlags } from '../src/util/cast_vote_records';
import { determineCvrContestTags } from '../src/cast_vote_records';

export type MockCastVoteRecordFile = Array<
  Tabulation.CastVoteRecord & { multiplier?: number }
>;

const mockPageLayout: BallotPageLayout = {
  pageSize: {
    width: 0,
    height: 0,
  },
  metadata: {
    ballotHash: '',
    ballotStyleId: '' as BallotStyleId,
    precinctId: '',
    pageNumber: 1,
    isTestMode: true,
    ballotType: BallotType.Precinct,
  },
  contests: [],
};

/**
 * Allows adding mock cast vote record to the store for testing tabulation.
 * Specify a list of cast vote records with an optional `multiplier` attribute
 * which will mean a cast vote record with the specified data will be added
 * `multiplier` times. Returns the created cast vote record IDs.
 */
export function addMockCvrFileToStore({
  electionId,
  mockCastVoteRecordFile,
  store,
}: {
  electionId: Id;
  mockCastVoteRecordFile: MockCastVoteRecordFile;
  store: Store;
}): string[] {
  const scannerIds = new Set<string>();
  for (const mockCastVoteRecord of mockCastVoteRecordFile) {
    store.addScannerBatch({
      electionId,
      batchId: mockCastVoteRecord.batchId,
      scannerId: mockCastVoteRecord.scannerId,
      label: `Batch ${mockCastVoteRecord.batchId}`,
    });
    scannerIds.add(mockCastVoteRecord.scannerId);
  }
  const cvrFileId = uuid();
  store.addCastVoteRecordFileRecord({
    id: cvrFileId,
    electionId,
    isTestMode: true,
    filename: 'mock-cvr-file',
    exportedTimestamp: new Date().toISOString(),
    sha256Hash: 'mock-hash',
    scannerIds,
  });

  const { electionDefinition } = assertDefined(store.getElection(electionId));
  const cvrIds = [];
  for (const mockCastVoteRecord of mockCastVoteRecordFile) {
    const isHmpb = mockCastVoteRecord.card.type === 'hmpb';
    for (let i = 0; i < (mockCastVoteRecord.multiplier ?? 1); i += 1) {
      const addCastVoteRecordResult = store.addCastVoteRecordFileEntry({
        electionId,
        cvrFileId,
        ballotId: uuid(),
        cvr: mockCastVoteRecord,
        adjudicationFlags: getCastVoteRecordAdjudicationFlags(
          mockCastVoteRecord.votes,
          electionDefinition
        ),
      });

      addCastVoteRecordResult.assertOk('failed to add mock cvr');
      const { cvrId } = addCastVoteRecordResult.unsafeUnwrap();
      cvrIds.push(cvrId);

      const writeIns: Array<{
        contestId: ContestId;
        optionId: ContestOptionId;
        isUnmarked: boolean;
      }> = [];
      for (const [contestId, optionIds] of Object.entries(
        mockCastVoteRecord.votes
      )) {
        for (const optionId of optionIds) {
          if (optionId.startsWith('write-in')) {
            writeIns.push({
              contestId,
              optionId,
              isUnmarked: optionId.includes('unmarked'),
            });
          }
        }
      }

      // add write-ins, all on the "front"
      if (writeIns.length) {
        store.addBallotImage({
          cvrId,
          imageData: Buffer.from([]),
          pageLayout: mockPageLayout,
          side: 'front',
        });

        for (const { contestId, optionId, isUnmarked } of writeIns) {
          store.addWriteIn({
            electionId,
            castVoteRecordId: cvrId,
            side: 'front',
            contestId,
            optionId,
            isUnmarked,
          });
        }
      }

      for (const tag of determineCvrContestTags({
        store,
        cvrId,
        writeIns,
        isHmpb,
        markScores: mockCastVoteRecord.markScores,
      })) {
        store.addCvrContestTag(tag);
      }
    }
  }

  return cvrIds;
}
