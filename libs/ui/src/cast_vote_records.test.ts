import {
  BallotStyleId,
  BallotType,
  ExportCastVoteRecordsToUsbDriveError,
} from '@votingworks/types';

import { userReadableMessageFromExportError } from './cast_vote_records';

test.each<{
  error: ExportCastVoteRecordsToUsbDriveError;
  expectedMessage: string;
}>([
  {
    error: {
      type: 'file-system-error',
    },
    expectedMessage: 'Unable to write to USB drive.',
  },
  {
    error: {
      type: 'missing-usb-drive',
    },
    expectedMessage: 'No USB drive detected.',
  },
  {
    error: {
      type: 'permission-denied',
    },
    expectedMessage: 'Unable to write to USB drive.',
  },
  {
    error: {
      type: 'relative-file-path',
    },
    expectedMessage: 'Invalid file path.',
  },
  {
    error: {
      type: 'invalid-sheet',
      subType: 'incompatible-interpretation-types',
      interpretationTypes: ['InterpretedBmdPage', 'InterpretedHmpbPage'],
    },
    expectedMessage:
      'Encountered an invalid sheet with incompatible interpretation types: front = InterpretedBmdPage, back = InterpretedHmpbPage.',
  },
  {
    error: {
      type: 'invalid-sheet',
      subType: 'mismatched-ballot-style-ids',
      ballotStyleIds: ['1' as BallotStyleId, '2' as BallotStyleId],
    },
    expectedMessage:
      'Encountered an invalid sheet with mismatched ballot styles: front = 1, back = 2.',
  },
  {
    error: {
      type: 'invalid-sheet',
      subType: 'mismatched-ballot-types',
      ballotTypes: [BallotType.Absentee, BallotType.Precinct],
    },
    expectedMessage:
      'Encountered an invalid sheet with mismatched ballot types: front = absentee, back = precinct.',
  },
  {
    error: {
      type: 'invalid-sheet',
      subType: 'mismatched-ballot-hashes',
      ballotHashes: ['1', '2'],
    },
    expectedMessage:
      'Encountered an invalid sheet with mismatched ballot hashes: front = 1, back = 2.',
  },
  {
    error: {
      type: 'invalid-sheet',
      subType: 'mismatched-precinct-ids',
      precinctIds: ['1', '2'],
    },
    expectedMessage:
      'Encountered an invalid sheet with mismatched precincts: front = 1, back = 2.',
  },
  {
    error: {
      type: 'invalid-sheet',
      subType: 'non-consecutive-page-numbers',
      pageNumbers: [1, 3],
    },
    expectedMessage:
      'Encountered an invalid sheet with non-consecutive page numbers: front = 1, back = 3.',
  },
  {
    error: {
      type: 'recovery-export-error',
      subType: 'expected-export-directory-does-not-exist',
    },
    expectedMessage: 'Recovery export failed.',
  },
  {
    error: {
      type: 'recovery-export-error',
      subType: 'hash-mismatch-after-recovery-export',
    },
    expectedMessage: 'Recovery export failed.',
  },
])('userReadableMessageFromExportError', ({ error, expectedMessage }) => {
  expect(userReadableMessageFromExportError(error)).toEqual(expectedMessage);
});
