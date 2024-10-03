import type {
  CastVoteRecordFileMetadata,
  CastVoteRecordFileRecord,
  CvrFileImportInfo,
  ManualResultsMetadataRecord,
} from '@votingworks/admin-backend';

export const mockCastVoteRecordFileRecord: CastVoteRecordFileRecord = {
  id: '',
  electionId: '',
  filename: '',
  exportTimestamp: '',
  numCvrsImported: 0,
  precinctIds: [],
  scannerIds: [],
  sha256Hash: '',
  createdAt: '',
};

export const TEST_FILE1 =
  'TEST__machine_0001__10_ballots__2020-12-09_15-49-32.jsonl';
export const TEST_FILE2 =
  'TEST__machine_0003__5_ballots__2020-12-07_15-49-32.jsonl';
export const LIVE_FILE1 = 'machine_0002__10_ballots__2020-12-09_15-59-32.jsonl';

export const mockCastVoteRecordImportInfo: CvrFileImportInfo = {
  wasExistingFile: false,
  newlyAdded: 1000,
  alreadyPresent: 0,
  exportedTimestamp: new Date().toISOString(),
  fileMode: 'test',
  fileName: 'cvrs.jsonl',
  id: 'cvr-file-1',
};

export const mockCastVoteRecordFileMetadata: CastVoteRecordFileMetadata[] = [
  {
    name: LIVE_FILE1,
    path: `/tmp/${LIVE_FILE1}`,
    cvrCount: 10,
    scannerIds: ['0002'],
    exportTimestamp: new Date(2020, 11, 9, 15, 59, 32),
    isTestModeResults: false,
  },
  {
    name: TEST_FILE1,
    path: `/tmp/${TEST_FILE1}`,
    cvrCount: 10,
    scannerIds: ['0001'],
    exportTimestamp: new Date(2020, 11, 9, 15, 49, 32),
    isTestModeResults: true,
  },
  {
    name: TEST_FILE2,
    path: `/tmp/${TEST_FILE2}`,
    cvrCount: 5,
    scannerIds: ['0003'],
    exportTimestamp: new Date(2020, 11, 7, 15, 49, 32),
    isTestModeResults: true,
  },
];

export const mockManualResultsMetadata: ManualResultsMetadataRecord[] = [
  {
    ballotStyleId: '1M',
    precinctId: 'precinct-1',
    votingMethod: 'precinct',
    ballotCount: 10,
    createdAt: new Date().toISOString(),
  },
];
