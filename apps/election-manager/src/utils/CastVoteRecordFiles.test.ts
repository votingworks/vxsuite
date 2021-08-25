import {electionSample} from '@votingworks/fixtures';
import CastVoteRecordFiles from './CastVoteRecordFiles';
import {CastVoteRecord} from '../config/types';

const TEST_DATE = new Date(2020, 3, 14, 1, 59, 26);

test('starts out empty', () => {
  const files = CastVoteRecordFiles.empty;
  expect(files.castVoteRecords).toEqual([]);
  expect(files.duplicateFiles).toEqual([]);
  expect(files.fileList).toEqual([]);
  expect(files.lastError).toBeUndefined();
});

test('can add a CVR file by creating a new instance', async () => {
  const {empty} = CastVoteRecordFiles;
  const added = await empty.add(
    new File([''], 'cvrs.txt', {lastModified: TEST_DATE.getTime()}),
    electionSample
  );

  expect(added.castVoteRecords).toEqual([[]]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      count: 0,
      precinctIds: [],
      scannerIds: [],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toBeUndefined();
});

test('can add multiple CVR files by creating a new instance', async () => {
  const {empty} = CastVoteRecordFiles;
  const cvr: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
  };
  const added = await empty.addAll(
    [
      new File([''], 'cvrs.txt', {lastModified: TEST_DATE.getTime()}),
      new File([JSON.stringify(cvr)], 'cvrs2.txt', {
        lastModified: TEST_DATE.getTime(),
      }),
    ],
    electionSample
  );

  expect(added.castVoteRecords).toEqual([[], [cvr]]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      count: 0,
      precinctIds: [],
      scannerIds: [],
      exportTimestamp: TEST_DATE,
    },
    {
      name: 'cvrs2.txt',
      count: 1,
      precinctIds: ['23'],
      scannerIds: ['abc'],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toBeUndefined();
  expect(added.fileMode).toBe('live');
});

test('test ballot cvrs change the file mode appropriately', async () => {
  const {empty} = CastVoteRecordFiles;
  const cvr: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _testBallot: true,
    _scannerId: 'abc',
  };
  const added = await empty.addAll(
    [
      new File([''], 'cvrs.txt', {lastModified: TEST_DATE.getTime()}),
      new File([JSON.stringify(cvr)], 'cvrs2.txt', {
        lastModified: TEST_DATE.getTime(),
      }),
    ],
    electionSample
  );

  expect(added.castVoteRecords).toEqual([[], [cvr]]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      count: 0,
      precinctIds: [],
      scannerIds: [],
      exportTimestamp: TEST_DATE,
    },
    {
      name: 'cvrs2.txt',
      count: 1,
      precinctIds: ['23'],
      scannerIds: ['abc'],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toBeUndefined();
  expect(added.fileMode).toBe('test');
});

test('does not mutate the original when adding a new instance', async () => {
  const {empty} = CastVoteRecordFiles;
  const cvr: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
  };
  const added = await empty.add(
    new File([JSON.stringify(cvr)], 'cvrs.txt', {
      lastModified: TEST_DATE.getTime(),
    }),
    electionSample
  );

  expect(empty.castVoteRecords).toEqual([]);
  expect(empty.duplicateFiles).toEqual([]);
  expect(empty.fileList).toEqual([]);
  expect(empty.lastError).toBeUndefined();

  expect(added.castVoteRecords).toEqual([[cvr]]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      count: 1,
      precinctIds: ['23'],
      scannerIds: ['abc'],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toBeUndefined();
});

test('records JSON errors', async () => {
  const added = await CastVoteRecordFiles.empty.add(
    new File(['{bad json'], 'cvrs.txt'),
    electionSample
  );

  expect(added.castVoteRecords).toEqual([]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([]);
  expect(added.lastError).toEqual({
    filename: 'cvrs.txt',
    message: 'Unexpected token b in JSON at position 1',
  });
});

test('records CVR data errors', async () => {
  const cvr: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '9999',
    _testBallot: false,
    _scannerId: 'abc',
  };
  const added = await CastVoteRecordFiles.empty.add(
    new File([JSON.stringify(cvr)], 'cvrs.txt'),
    electionSample
  );

  expect(added.castVoteRecords).toEqual([]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([]);
  expect(added.lastError).toEqual({
    filename: 'cvrs.txt',
    message: "Line 1: Precinct '9999' in CVR is not in the election definition",
  });
});

test('records identical uploaded files', async () => {
  const cvr: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
  };
  const added = await CastVoteRecordFiles.empty.addAll(
    [
      new File([JSON.stringify(cvr)], 'cvrs.txt', {
        lastModified: TEST_DATE.getTime(),
      }),
      new File([JSON.stringify(cvr)], 'cvrs2.txt', {
        lastModified: TEST_DATE.getTime(),
      }),
    ],
    electionSample
  );

  expect(added.castVoteRecords).toEqual([[cvr]]);
  expect(added.duplicateFiles).toEqual(['cvrs2.txt']);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      count: 1,
      precinctIds: ['23'],
      scannerIds: ['abc'],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toBeUndefined();
});

test('refuses to tabulate both live and test CVRs', async () => {
  const cvr: CastVoteRecord = {
    _ballotId: 'abc',
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
  };

  const otherCvr = {
    ...cvr,
    _testBallot: true,
  };

  const added = await CastVoteRecordFiles.empty.addAll(
    [
      new File([JSON.stringify(cvr)], 'cvrs.txt', {
        lastModified: TEST_DATE.getTime(),
      }),
      new File([JSON.stringify(otherCvr)], 'cvrs2.txt', {
        lastModified: TEST_DATE.getTime(),
      }),
    ],
    electionSample
  );

  expect(added.castVoteRecords).toEqual([[cvr]]);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      count: 1,
      precinctIds: ['23'],
      scannerIds: ['abc'],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toEqual({
    filename: 'cvrs2.txt',
    message:
      'These CVRs cannot be tabulated together because they mix live and test ballots',
  });
});
