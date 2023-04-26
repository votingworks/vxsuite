import { iter } from '@votingworks/basics';
import { mockOf } from '@votingworks/test-utils';
import {
  BallotPageMetadata,
  BallotType,
  CastVoteRecord,
} from '@votingworks/types';
import { isFeatureFlagEnabled } from '@votingworks/utils';
import { writeFile } from 'fs-extra';
import * as tmp from 'tmp';
import { v4 as uuid } from 'uuid';
import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { Store } from '../store';
import * as buildCastVoteRecord from './build';
import { exportCastVoteRecords } from './export';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

const metadata: BallotPageMetadata = {
  locales: { primary: 'en-US' },
  electionHash:
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition
      .electionHash,
  ballotType: BallotType.Standard,
  ballotStyleId: 'card-number-3',
  precinctId: 'town-id-00701-precinct-id-',
  isTestMode: false,
  pageNumber: 1,
};

beforeEach(() => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => false);
});

test('exportCvrs', () => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => true);

  const buildCastVoteRecordMock = jest.spyOn(
    buildCastVoteRecord,
    'buildCastVoteRecord'
  );

  const cvr: CastVoteRecord = {
    _ballotStyleId: 'card-number-3',
    _ballotType: 'standard',
    _batchId: 'cd79e271-d5a3-4755-9af4-dfb491b8bcf1',
    _batchLabel: 'batch label',
    _precinctId: 'town-id-00701-precinct-id-',
    _scannerId: '000',
    _testBallot: false,
    _pageNumbers: [1, 2],
    'Governor-061a401b': ['write-in-1'],
  };

  buildCastVoteRecordMock.mockReturnValue(cvr);

  const store = Store.memoryStore();
  store.setElection(
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition
      .electionData
  );

  // No CVRs, export should be empty
  expect(iter(exportCastVoteRecords({ store })).toArray()).toEqual([]);

  // Create CVRs, confirm that they are exported should work
  const batchId = store.addBatch();
  store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/tmp/front-page.png',
      normalizedFilename: '/tmp/front-page-normalized.png',
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [],
        },
        markInfo: {
          marks: [],
          ballotSize: { width: 1, height: 1 },
        },
        votes: {},
      },
    },
    {
      originalFilename: '/tmp/back-page.png',
      normalizedFilename: '/tmp/back-page-normalized.png',
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 2,
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [],
        },
        markInfo: {
          marks: [],
          ballotSize: { width: 1, height: 1 },
        },
        votes: {},
      },
    },
  ]);

  // CVR should be in export
  expect(iter(exportCastVoteRecords({ store })).toArray()).toMatchObject([cvr]);

  // Confirm that deleted batches are not included in exported CVRs
  store.deleteBatch(batchId);
  expect(iter(exportCastVoteRecords({ store })).toArray()).toEqual([]);
});

test('exportCvrs orders by sheet ID', async () => {
  const store = Store.memoryStore();
  store.setElection(
    electionGridLayoutNewHampshireAmherstFixtures.electionDefinition
      .electionData
  );

  // Create CVRs, confirm that they are exported should work
  const sheetIds = ['fake-uuid-zzz', 'fake-uuid-lll', 'fake-uuid-aaa'];
  const batchId = store.addBatch();
  for (const sheetId of sheetIds) {
    const frontNormalizedFile = tmp.fileSync();
    await writeFile(frontNormalizedFile.fd, 'front normalized');

    const backNormalizedFile = tmp.fileSync();
    await writeFile(backNormalizedFile.fd, 'back normalized');

    store.addSheet(sheetId, batchId, [
      {
        originalFilename: `/tmp/front-page-${sheetId}.png`,
        normalizedFilename: frontNormalizedFile.name,
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
        },
      },
      {
        originalFilename: `/tmp/back-page-${sheetId}.png`,
        normalizedFilename: backNormalizedFile.name,
        interpretation: {
          type: 'InterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 2,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            enabledReasons: [],
            enabledReasonInfos: [],
            ignoredReasonInfos: [],
          },
          markInfo: {
            marks: [],
            ballotSize: { width: 1, height: 1 },
          },
          votes: {},
        },
      },
    ]);
  }

  const exportedCvrs: CastVoteRecord[] = iter(
    exportCastVoteRecords({ store })
  ).toArray();
  const exportedCvrBallotIds = exportedCvrs.map((cvr) => cvr._ballotId);

  expect(exportedCvrBallotIds).toStrictEqual([...sheetIds].sort());
});
