import { electionSample } from '@votingworks/fixtures';
import {
  BallotIdSchema,
  CastVoteRecord,
  unsafeParse,
} from '@votingworks/types';
import moment from 'moment';
import { CastVoteRecordFilePreprocessedData } from '../config/types';
import { CastVoteRecordFiles } from './cast_vote_record_files';

const TEST_DATE = new Date(2020, 3, 14, 1, 59, 26);

test('starts out empty', () => {
  const files = CastVoteRecordFiles.empty;
  expect([...files.castVoteRecords]).toEqual([]);
  expect(files.duplicateFiles).toEqual([]);
  expect(files.fileList).toEqual([]);
  expect(files.lastError).toBeUndefined();
});

test('can add a CVR file by creating a new instance', async () => {
  const { empty } = CastVoteRecordFiles;
  const added = await empty.add(
    new File([''], 'cvrs.txt', { lastModified: TEST_DATE.getTime() }),
    electionSample
  );

  expect([...added.castVoteRecords]).toEqual([]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      duplicatedCvrCount: 0,
      importedCvrCount: 0,
      allCastVoteRecords: [],
      precinctIds: [],
      scannerIds: [],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toBeUndefined();
});

test('can add multiple CVR files by creating a new instance', async () => {
  const { empty } = CastVoteRecordFiles;
  const cvr: CastVoteRecord = {
    _ballotId: unsafeParse(BallotIdSchema, 'abc'),
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
    _batchId: 'batch-1',
    _batchLabel: 'Batch 1',
  };
  const added = await empty.addAll(
    [
      new File([''], 'cvrs.txt', { lastModified: TEST_DATE.getTime() }),
      new File([JSON.stringify(cvr)], 'cvrs2.txt', {
        lastModified: TEST_DATE.getTime(),
      }),
    ],
    electionSample
  );

  expect([...added.castVoteRecords]).toEqual([cvr]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      duplicatedCvrCount: 0,
      importedCvrCount: 0,
      precinctIds: [],
      scannerIds: [],
      allCastVoteRecords: [],
      exportTimestamp: TEST_DATE,
    },
    {
      name: 'cvrs2.txt',
      duplicatedCvrCount: 0,
      importedCvrCount: 1,
      precinctIds: ['23'],
      scannerIds: ['abc'],
      allCastVoteRecords: [cvr],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toBeUndefined();
});

test('can handle duplicate CVR records gracefully', async () => {
  const { empty } = CastVoteRecordFiles;
  const cvr: CastVoteRecord = {
    _ballotId: unsafeParse(BallotIdSchema, 'abc'),
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
    _batchId: 'batch-1',
    _batchLabel: 'Batch 1',
  };
  const cvr2: CastVoteRecord = {
    ...cvr,
    _ballotId: unsafeParse(BallotIdSchema, 'def'),
  };
  const added = await empty.addAll(
    [
      new File([JSON.stringify(cvr)], 'cvrs.txt', {
        lastModified: TEST_DATE.getTime(),
      }),
      new File(
        [`${JSON.stringify(cvr)}\n${JSON.stringify(cvr2)}`],
        'cvrs2.txt',
        {
          lastModified: TEST_DATE.getTime(),
        }
      ),
    ],
    electionSample
  );

  expect([...added.castVoteRecords]).toEqual([cvr, cvr2]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      duplicatedCvrCount: 0,
      importedCvrCount: 1,
      precinctIds: ['23'],
      scannerIds: ['abc'],
      allCastVoteRecords: [cvr],
      exportTimestamp: TEST_DATE,
    },
    {
      name: 'cvrs2.txt',
      duplicatedCvrCount: 1,
      importedCvrCount: 1,
      precinctIds: ['23'],
      scannerIds: ['abc'],
      allCastVoteRecords: [cvr, cvr2],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toBeUndefined();
});

test('can preprocess files to give information about expected duplicates', async () => {
  const { empty } = CastVoteRecordFiles;
  const cvr: CastVoteRecord = {
    _ballotId: unsafeParse(BallotIdSchema, 'abc'),
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
    _batchId: 'batch-1',
    _batchLabel: 'Batch 1',
  };
  const existingFileName = `machine_abc__1_ballots__${moment(TEST_DATE).format(
    'YYYY-MM-DD_HH-mm-ss'
  )}`;
  const added = await empty.addAll(
    [
      new File([JSON.stringify(cvr)], existingFileName, {
        lastModified: TEST_DATE.getTime(),
      }),
    ],
    electionSample
  );

  expect([...added.castVoteRecords]).toEqual([cvr]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([
    {
      name: existingFileName,
      duplicatedCvrCount: 0,
      importedCvrCount: 1,
      precinctIds: ['23'],
      scannerIds: ['abc'],
      allCastVoteRecords: [cvr],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toBeUndefined();

  const newFileDate = moment(TEST_DATE).add(2, 'days').toDate();
  const newFileName = `machine_abc__3_ballots__${moment(newFileDate).format(
    'YYYY-MM-DD_HH-mm-ss'
  )}`;
  const parsedData = CastVoteRecordFiles.parseAllFromFileSystemEntries([
    {
      name: newFileName,
      path: 'this/is/a/path',
      type: 1,
      size: 0,
      mtime: newFileDate,
      atime: new Date(),
      ctime: new Date(),
    },
  ]);
  expect(parsedData).toEqual<CastVoteRecordFilePreprocessedData[]>([
    {
      name: newFileName,
      path: 'this/is/a/path',
      cvrCount: 3,
      scannerIds: ['abc'],
      exportTimestamp: newFileDate,
      isTestModeResults: false,
    },
  ]);
});

test('parseAllFromFileSystemEntries handles empty files', async () => {
  const { empty } = CastVoteRecordFiles;

  const existingFileName = `machine_abc__0_ballots__${moment(TEST_DATE).format(
    'YYYY-MM-DD_HH-mm-ss'
  )}`;
  const added = await empty.addAll(
    [new File([''], existingFileName, { lastModified: TEST_DATE.getTime() })],
    electionSample
  );

  expect([...added.castVoteRecords]).toEqual([]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([
    {
      name: existingFileName,
      duplicatedCvrCount: 0,
      importedCvrCount: 0,
      precinctIds: [],
      scannerIds: [],
      allCastVoteRecords: [],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toBeUndefined();

  expect(
    CastVoteRecordFiles.parseAllFromFileSystemEntries([
      {
        name: existingFileName,
        path: 'this/is/a/path',
        type: 1,
        size: 0,
        mtime: TEST_DATE,
        atime: new Date(),
        ctime: new Date(),
      },
    ])
  ).toEqual([
    {
      name: existingFileName,
      path: 'this/is/a/path',
      cvrCount: 0,
      scannerIds: ['abc'],
      exportTimestamp: TEST_DATE,
      isTestModeResults: false,
    },
  ]);
});

test('test ballot cvrs change the file mode appropriately', async () => {
  const { empty } = CastVoteRecordFiles;
  const cvr: CastVoteRecord = {
    _ballotId: unsafeParse(BallotIdSchema, 'abc'),
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _testBallot: true,
    _scannerId: 'abc',
    _batchId: 'batch-1',
    _batchLabel: 'Batch 1',
  };
  const added = await empty.addAll(
    [
      new File([''], 'cvrs.txt', { lastModified: TEST_DATE.getTime() }),
      new File([JSON.stringify(cvr)], 'cvrs2.txt', {
        lastModified: TEST_DATE.getTime(),
      }),
    ],
    electionSample
  );

  expect([...added.castVoteRecords]).toEqual([cvr]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      duplicatedCvrCount: 0,
      importedCvrCount: 0,
      allCastVoteRecords: [],
      precinctIds: [],
      scannerIds: [],
      exportTimestamp: TEST_DATE,
    },
    {
      name: 'cvrs2.txt',
      duplicatedCvrCount: 0,
      importedCvrCount: 1,
      allCastVoteRecords: [cvr],
      precinctIds: ['23'],
      scannerIds: ['abc'],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toBeUndefined();
});

test('does not mutate the original when adding a new instance', async () => {
  const { empty } = CastVoteRecordFiles;
  const cvr: CastVoteRecord = {
    _ballotId: unsafeParse(BallotIdSchema, 'abc'),
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
    _batchId: 'batch-1',
    _batchLabel: 'Batch 1',
  };
  const added = await empty.add(
    new File([JSON.stringify(cvr)], 'cvrs.txt', {
      lastModified: TEST_DATE.getTime(),
    }),
    electionSample
  );

  expect([...empty.castVoteRecords]).toEqual([]);
  expect(empty.duplicateFiles).toEqual([]);
  expect(empty.fileList).toEqual([]);
  expect(empty.lastError).toBeUndefined();

  expect([...added.castVoteRecords]).toEqual([cvr]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      duplicatedCvrCount: 0,
      importedCvrCount: 1,
      allCastVoteRecords: [cvr],
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

  expect([...added.castVoteRecords]).toEqual([]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([]);
  expect(added.lastError).toEqual({
    filename: 'cvrs.txt',
    message: 'Unexpected token b in JSON at position 1',
  });
});

test('records CVR data errors', async () => {
  const cvr: CastVoteRecord = {
    _ballotId: unsafeParse(BallotIdSchema, 'abc'),
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '9999',
    _testBallot: false,
    _scannerId: 'abc',
    _batchId: 'batch-1',
    _batchLabel: 'Batch 1',
  };
  const added = await CastVoteRecordFiles.empty.add(
    new File([JSON.stringify(cvr)], 'cvrs.txt'),
    electionSample
  );

  expect([...added.castVoteRecords]).toEqual([]);
  expect(added.duplicateFiles).toEqual([]);
  expect(added.fileList).toEqual([]);
  expect(added.lastError).toEqual({
    filename: 'cvrs.txt',
    message: "Line 1: Precinct '9999' in CVR is not in the election definition",
  });
});

test('records identical loaded files', async () => {
  const cvr: CastVoteRecord = {
    _ballotId: unsafeParse(BallotIdSchema, 'abc'),
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
    _batchId: 'batch-1',
    _batchLabel: 'Batch 1',
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

  expect([...added.castVoteRecords]).toEqual([cvr]);
  expect(added.duplicateFiles).toEqual(['cvrs2.txt']);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      duplicatedCvrCount: 0,
      importedCvrCount: 1,
      allCastVoteRecords: [cvr],
      precinctIds: ['23'],
      scannerIds: ['abc'],
      exportTimestamp: TEST_DATE,
    },
  ]);
  expect(added.lastError).toBeUndefined();
});

test('refuses to tabulate both live and test CVRs', async () => {
  const cvr: CastVoteRecord = {
    _ballotId: unsafeParse(BallotIdSchema, 'abc'),
    _ballotStyleId: '12',
    _ballotType: 'standard',
    _precinctId: '23',
    _testBallot: false,
    _scannerId: 'abc',
    _batchId: 'batch-1',
    _batchLabel: 'Batch 1',
  };

  const otherCvr: CastVoteRecord = {
    ...cvr,
    _testBallot: true,
    _ballotId: unsafeParse(BallotIdSchema, 'def'),
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

  expect([...added.castVoteRecords]).toEqual([cvr]);
  expect(added.fileList).toEqual([
    {
      name: 'cvrs.txt',
      duplicatedCvrCount: 0,
      importedCvrCount: 1,
      allCastVoteRecords: [cvr],
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
