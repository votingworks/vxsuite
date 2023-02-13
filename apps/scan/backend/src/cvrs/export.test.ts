import { mockOf } from '@votingworks/test-utils';
import {
  BallotPageMetadata,
  BallotType,
  CastVoteRecord,
} from '@votingworks/types';
import {
  BallotConfig,
  BallotPackageEntry,
  isFeatureFlagEnabled,
} from '@votingworks/shared';
import { copyFile, writeFile } from 'fs-extra';
import * as streams from 'memory-streams';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import * as tmp from 'tmp';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import * as stateOfHamilton from '../../test/fixtures/state-of-hamilton';
import { Store } from '../store';
import * as buildCastVoteRecord from './build';
import { exportCastVoteRecordsAsNdJson } from './export';

const BlankJpegPath = join(__dirname, '../../test/blank.jpg');

jest.mock('@votingworks/shared', (): typeof import('@votingworks/shared') => {
  return {
    ...jest.requireActual('@votingworks/shared'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

const ballotConfig: BallotConfig = {
  filename: 'test-filename',
  layoutFilename: 'test-layout-filename',
  locales: { primary: 'en-US' },
  isLiveMode: true,
  isAbsentee: false,
  ballotStyleId: stateOfHamilton.election.ballotStyles[0].id,
  precinctId: stateOfHamilton.election.precincts[0].id,
  contestIds: [],
};

const metadata: BallotPageMetadata = {
  locales: { primary: 'en-US' },
  electionHash: stateOfHamilton.electionDefinition.electionHash,
  ballotType: BallotType.Standard,
  ballotStyleId: stateOfHamilton.election.ballotStyles[0].id,
  precinctId: stateOfHamilton.election.precincts[0].id,
  isTestMode: false,
  pageNumber: 1,
};

const ballotTemplates: BallotPackageEntry[] = [
  {
    pdf: fs.readFileSync(stateOfHamilton.ballotPdf),
    layout: [1, 2, 3, 4, 5, 6].map((i) => ({
      pageSize: { width: 1, height: 1 },
      metadata: { ...metadata, pageNumber: i },
      contests: [],
    })),
    ballotConfig,
  },
];

beforeEach(() => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => false);
});

test('exportCvrs', async () => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => true);

  const buildCastVoteRecordMock = jest.spyOn(
    buildCastVoteRecord,
    'buildCastVoteRecord'
  );

  const addBallotImagesToCvrMock = jest.spyOn(
    buildCastVoteRecord,
    'addBallotImagesToCvr'
  );

  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _batchId: 'cd79e271-d5a3-4755-9af4-dfb491b8bcf1',
    _batchLabel: 'batch label',
    _precinctId: '23',
    _scannerId: '000',
    _testBallot: false,
    _pageNumbers: [1, 2],
    'county-commissioners': ['write-in-1'],
  };

  buildCastVoteRecordMock.mockReturnValue(cvr);

  const frontNormalizedFilePath = tmp.tmpNameSync();
  await copyFile(BlankJpegPath, frontNormalizedFilePath);

  const backNormalizedFilePath = tmp.tmpNameSync();
  await copyFile(BlankJpegPath, backNormalizedFilePath);

  const store = Store.memoryStore();
  store.setElection(stateOfHamilton.electionDefinition.electionData);

  // No CVRs, export should be empty
  let stream = new streams.WritableStream();
  await pipeline(exportCastVoteRecordsAsNdJson({ store }), stream);
  expect(stream.toString()).toEqual('');

  await store.setHmpbTemplates(ballotTemplates);

  // Create CVRs, confirm that they are exported should work
  const batchId = store.addBatch();
  const sheetId = store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/tmp/front-page.png',
      normalizedFilename: frontNormalizedFilePath,
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
      },
    },
    {
      originalFilename: '/tmp/back-page.png',
      normalizedFilename: backNormalizedFilePath,
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 2,
        },
      },
    },
  ]);
  store.adjudicateSheet(sheetId);

  stream = new streams.WritableStream();
  await pipeline(exportCastVoteRecordsAsNdJson({ store }), stream);
  expect(stream.toString()).toEqual(
    expect.stringContaining(stateOfHamilton.election.precincts[0].id)
  );

  // Confirm that ballot layouts are included when building the CVR
  expect(buildCastVoteRecordMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.arrayContaining([
      expect.objectContaining({ contests: [] }),
      expect.objectContaining({ contests: [] }),
    ])
  );

  // confirm ballot images were added for the write-in
  expect(addBallotImagesToCvrMock).toHaveBeenCalledTimes(1);

  // Confirm that deleted batches are not included in exported CVRs
  stream = new streams.WritableStream();
  store.deleteBatch(batchId);
  await pipeline(exportCastVoteRecordsAsNdJson({ store }), stream);
  expect(stream.toString()).toEqual('');
});

test('exportCvrs without write-ins does not load ballot images', async () => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => true);

  const buildCastVoteRecordMock = jest.spyOn(
    buildCastVoteRecord,
    'buildCastVoteRecord'
  );

  const addBallotImagesToCvrMock = jest.spyOn(
    buildCastVoteRecord,
    'addBallotImagesToCvr'
  );

  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _batchId: 'cd79e271-d5a3-4755-9af4-dfb491b8bcf1',
    _batchLabel: 'batch label',
    _precinctId: '23',
    _scannerId: '000',
    _testBallot: false,
    _pageNumbers: [1, 2],
    'county-commissioners': ['witherspoonsmithson'], // an existing candidate, not a write-in
  };

  buildCastVoteRecordMock.mockReturnValue(cvr);

  const frontNormalizedFilePath = tmp.tmpNameSync();
  await copyFile(BlankJpegPath, frontNormalizedFilePath);

  const backNormalizedFilePath = tmp.tmpNameSync();
  await copyFile(BlankJpegPath, backNormalizedFilePath);

  const store = Store.memoryStore();
  store.setElection(stateOfHamilton.electionDefinition.electionData);

  // No CVRs, export should be empty
  let stream = new streams.WritableStream();
  await pipeline(exportCastVoteRecordsAsNdJson({ store }), stream);
  expect(stream.toString()).toEqual('');

  await store.setHmpbTemplates(ballotTemplates);

  // Create CVRs, confirm that they are exported should work
  const batchId = store.addBatch();
  const sheetId = store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/tmp/front-page.png',
      normalizedFilename: frontNormalizedFilePath,
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 2,
        },
      },
    },
    {
      originalFilename: '/tmp/back-page.png',
      normalizedFilename: backNormalizedFilePath,
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
      },
    },
  ]);
  store.adjudicateSheet(sheetId);

  stream = new streams.WritableStream();
  await pipeline(exportCastVoteRecordsAsNdJson({ store }), stream);
  expect(stream.toString()).toEqual(
    expect.stringContaining(stateOfHamilton.election.precincts[0].id)
  );

  // Confirm that ballot layouts are included when building the CVR
  expect(buildCastVoteRecordMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.arrayContaining([
      expect.objectContaining({ contests: [] }),
      expect.objectContaining({ contests: [] }),
    ])
  );

  // confirm ballot images were NOT added, since it's not a write-in
  expect(addBallotImagesToCvrMock).not.toHaveBeenCalled();

  // Confirm that deleted batches are not included in exported CVRs
  stream = new streams.WritableStream();
  store.deleteBatch(batchId);
  await pipeline(exportCastVoteRecordsAsNdJson({ store }), stream);
  expect(stream.toString()).toEqual('');
});

test('exportCvrs does not export ballot images when feature flag turned off', async () => {
  const buildCastVoteRecordMock = jest.spyOn(
    buildCastVoteRecord,
    'buildCastVoteRecord'
  );
  const addBallotImagesToCvrMock = jest.spyOn(
    buildCastVoteRecord,
    'addBallotImagesToCvr'
  );

  const cvr: CastVoteRecord = {
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _batchId: 'cd79e271-d5a3-4755-9af4-dfb491b8bcf1',
    _batchLabel: 'batch label',
    _precinctId: '23',
    _scannerId: '000',
    _testBallot: false,
    _pageNumbers: [1, 2],
    'county-commissioners': ['write-in-1'],
  };

  buildCastVoteRecordMock.mockReturnValue(cvr);

  const frontNormalizedFilePath = tmp.tmpNameSync();
  await copyFile(BlankJpegPath, frontNormalizedFilePath);

  const backNormalizedFilePath = tmp.tmpNameSync();
  await copyFile(BlankJpegPath, backNormalizedFilePath);

  const store = Store.memoryStore();
  store.setElection(stateOfHamilton.electionDefinition.electionData);

  let stream = new streams.WritableStream();

  await store.setHmpbTemplates(ballotTemplates);

  // Create CVRs, confirm that they are exported should work
  const batchId = store.addBatch();
  const sheetId = store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/tmp/front-page.png',
      normalizedFilename: frontNormalizedFilePath,
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
      },
    },
    {
      originalFilename: '/tmp/back-page.png',
      normalizedFilename: backNormalizedFilePath,
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 2,
        },
      },
    },
  ]);
  store.adjudicateSheet(sheetId);

  stream = new streams.WritableStream();
  await pipeline(exportCastVoteRecordsAsNdJson({ store }), stream);
  expect(stream.toString()).toEqual(
    expect.stringContaining(stateOfHamilton.election.precincts[0].id)
  );

  // Confirm that ballot images and layouts are NOT included when building the CVR
  expect(buildCastVoteRecordMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    undefined // layouts are undefined when feature flag turned off
  );

  // confirm ballot images were NOT added
  expect(addBallotImagesToCvrMock).not.toHaveBeenCalled();
});

test('exportCvrs does not export ballot images when skipImages is true', async () => {
  mockOf(isFeatureFlagEnabled).mockImplementation(() => true);

  const buildCastVoteRecordMock = jest.spyOn(
    buildCastVoteRecord,
    'buildCastVoteRecord'
  );
  const addBallotImagesToCvrMock = jest.spyOn(
    buildCastVoteRecord,
    'addBallotImagesToCvr'
  );

  const store = Store.memoryStore();
  store.setElection(stateOfHamilton.electionDefinition.electionData);

  // No CVRs, export should be empty
  let stream = new streams.WritableStream();

  await store.setHmpbTemplates(ballotTemplates);

  const frontNormalizedFile = tmp.fileSync();
  await writeFile(frontNormalizedFile.fd, 'front normalized');

  const backNormalizedFile = tmp.fileSync();
  await writeFile(backNormalizedFile.fd, 'back normalized');

  // Create CVRs, confirm that they are exported should work
  const batchId = store.addBatch();
  const sheetId = store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/tmp/front-page.png',
      normalizedFilename: frontNormalizedFile.name,
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
      },
    },
    {
      originalFilename: '/tmp/back-page.png',
      normalizedFilename: backNormalizedFile.name,
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 2,
        },
      },
    },
  ]);
  store.adjudicateSheet(sheetId);

  stream = new streams.WritableStream();
  await pipeline(
    exportCastVoteRecordsAsNdJson({ store, skipImages: true }),
    stream
  );
  expect(stream.toString()).toEqual(
    expect.stringContaining(stateOfHamilton.election.precincts[0].id)
  );

  expect(buildCastVoteRecordMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    undefined // layouts are undefined when skipImages is true
  );

  // confirm ballot images were NOT added
  expect(addBallotImagesToCvrMock).not.toHaveBeenCalled();
});

test('exportCvrs called with orderBySheetId actually orders by sheet ID', async () => {
  const store = Store.memoryStore();
  store.setElection(stateOfHamilton.electionDefinition.electionData);

  await store.setHmpbTemplates(ballotTemplates);

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
          type: 'UninterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
        },
      },
      {
        originalFilename: `/tmp/back-page-${sheetId}.png`,
        normalizedFilename: backNormalizedFile.name,
        interpretation: {
          type: 'UninterpretedHmpbPage',
          metadata: {
            ...metadata,
            pageNumber: 2,
          },
        },
      },
    ]);
    store.adjudicateSheet(sheetId);
  }

  const stream = new streams.WritableStream();
  await pipeline(
    exportCastVoteRecordsAsNdJson({ store, orderBySheetId: true }),
    stream
  );
  const exportedCvrs: CastVoteRecord[] = stream
    .toString()
    .split('\n')
    .filter((line) => line) // filter out empty lines
    .map((cvrString) => JSON.parse(cvrString));

  const exportedCvrBallotIds = exportedCvrs.map((cvr) => cvr._ballotId);

  expect(exportedCvrBallotIds).toStrictEqual([...sheetIds].sort());
});
