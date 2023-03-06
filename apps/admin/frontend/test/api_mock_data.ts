import { Admin } from '@votingworks/api';

export const mockCastVoteRecordFileRecord: Admin.CastVoteRecordFileRecord = {
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

export const mockPrintedBallot: Admin.PrintedBallot = {
  ballotStyleId: '4',
  precinctId: '6538',
  locales: { primary: 'en-US', secondary: undefined },
  numCopies: 1,
  ballotType: 'absentee',
  ballotMode: Admin.BallotMode.Official,
};

export const mockPrintedBallotRecord: Admin.PrintedBallotRecord = {
  ballotStyleId: '1M',
  precinctId: 'precinct-1',
  locales: { primary: 'en-US', secondary: undefined },
  numCopies: 1,
  ballotType: 'absentee',
  ballotMode: Admin.BallotMode.Official,
  id: 'id',
  electionId: 'id',
  createdAt: new Date().toISOString(),
};
