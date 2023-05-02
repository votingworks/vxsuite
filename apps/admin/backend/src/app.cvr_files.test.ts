import { assert } from '@votingworks/basics';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { CVR as CVRType, safeParse } from '@votingworks/types';
import { basename, join } from 'path';
import * as fs from 'fs';
import { CVR_BALLOT_LAYOUTS_SUBDIRECTORY } from '@votingworks/backend';
import { vxBallotType } from '@votingworks/types/src/cdf/cast-vote-records';
import {
  BooleanEnvironmentVariableName,
  castVoteRecordHasWriteIns,
  castVoteRecordVoteIsWriteIn,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  buildTestEnvironment,
  configureMachine,
  mockCastVoteRecordFileTree,
  mockElectionManagerAuth,
} from '../test/app';
import { modifyCastVoteRecordReport } from '../test/utils';
import { deprecatedGetWriteInsFromCastVoteRecord } from './util/cvrs';

jest.setTimeout(60_000);

// mock SKIP_CVR_ELECTION_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

beforeEach(() => {
  jest.restoreAllMocks();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

const { electionDefinition, castVoteRecordReport } =
  electionMinimalExhaustiveSampleFixtures;

async function getOfficialReportPath(): Promise<string> {
  return await modifyCastVoteRecordReport(
    castVoteRecordReport.asDirectoryPath(),
    ({ CVR }) => ({
      ReportType: [CVRType.ReportType.OriginatingDeviceExport],
      OtherReportType: undefined,
      CVR: CVR.take(10), // speeds up tests
    })
  );
}

test('happy path - mock election flow', async () => {
  const { apiClient, auth, mockUsb, logger } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // initially, no files or cast vote records
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual('unlocked');
  expect(await apiClient.listCastVoteRecordFilesOnUsb()).toEqual([]);

  // insert a USB drive
  const { insertUsbDrive, removeUsbDrive } = mockUsb;
  const testReportDirectoryName =
    'TEST__machine_0000__3000_ballots__2022-07-01_11-21-41';
  const testExportTimestamp = '2022-07-01T11:21:41.000Z';
  insertUsbDrive(
    mockCastVoteRecordFileTree(electionDefinition, {
      [testReportDirectoryName]: castVoteRecordReport.asDirectoryPath(),
    })
  );
  const availableCastVoteRecordFiles =
    await apiClient.listCastVoteRecordFilesOnUsb();
  expect(availableCastVoteRecordFiles).toMatchObject([
    expect.objectContaining({
      name: testReportDirectoryName,
      cvrCount: 3000,
      exportTimestamp: new Date(testExportTimestamp),
      isTestModeResults: true,
      scannerIds: ['0000'],
    }),
  ]);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.CvrFilesReadFromUsb,
    'system',
    {
      disposition: 'success',
      message: 'Found 1 CVR files on USB drive, user shown option to load.',
    }
  );

  // add a file
  const addTestFileResult = await apiClient.addCastVoteRecordFile({
    path: availableCastVoteRecordFiles[0]!.path,
  });
  assert(addTestFileResult.isOk());
  expect(addTestFileResult.ok()).toMatchObject({
    wasExistingFile: false,
    exportedTimestamp: testExportTimestamp,
    alreadyPresent: 0,
    newlyAdded: 3000,
    fileMode: 'test',
    fileName: testReportDirectoryName,
  });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.CvrLoaded,
    'election_manager',
    {
      disposition: 'success',
      filename: testReportDirectoryName,
      message: expect.anything(),
      numberOfBallotsImported: 3000,
      duplicateBallotsIgnored: 0,
    }
  );
  removeUsbDrive();

  // should now be able to retrieve the file
  expect(await apiClient.getCastVoteRecordFiles()).toEqual([
    expect.objectContaining({
      exportTimestamp: testExportTimestamp,
      filename: testReportDirectoryName,
      numCvrsImported: 3000,
      precinctIds: ['precinct-1', 'precinct-2'],
      scannerIds: ['VX-00-000'],
    }),
  ]);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual('test');

  // check cast vote record count and a single record. a record with the
  // specified votes should exist given the size of the cast vote record
  expect(await apiClient.getCastVoteRecords()).toHaveLength(3000);
  expect(await apiClient.getCastVoteRecords()).toMatchObject(
    expect.arrayContaining([
      expect.objectContaining({
        _ballotType: 'absentee',
        _precinctId: 'precinct-1',
        _ballotStyleId: '1M',
        _testBallot: true,
        _scannerId: 'VX-00-000',
        _batchId: '9822c71014',
        _batchLabel: '9822c71014',
        'best-animal-mammal': [],
        'zoo-council-mammal': [],
        'new-zoo-either': ['yes'],
        'new-zoo-pick': ['yes'],
        fishing: ['yes'],
      }),
    ])
  );

  // check that cast vote records with write-ins have ballot images and layouts
  const expectedWriteInRecords: Array<{ contestId: string; optionId: string }> =
    [];
  for (const castVoteRecord of await apiClient.getCastVoteRecords()) {
    if (castVoteRecordHasWriteIns(castVoteRecord)) {
      for (const [contestId, vote] of deprecatedGetWriteInsFromCastVoteRecord(
        castVoteRecord
      ).entries()) {
        for (const voteOption of vote) {
          if (castVoteRecordVoteIsWriteIn(voteOption)) {
            expectedWriteInRecords.push({
              contestId,
              optionId: voteOption,
            });
          }
        }
      }
    }
  }

  // check write-in records were correctly created
  expect(await apiClient.getWriteIns()).toHaveLength(
    expectedWriteInRecords.length
  );
  expect(
    (await apiClient.getWriteIns()).sort(
      (a, b) =>
        a.contestId.localeCompare(b.contestId) ||
        a.optionId.localeCompare(b.optionId)
    )
  ).toEqual(
    expectedWriteInRecords
      .slice()
      .sort(
        (a, b) =>
          a.contestId.localeCompare(b.contestId) ||
          a.optionId.localeCompare(b.optionId)
      )
      .map((partialRecord) => expect.objectContaining(partialRecord))
  );

  // remove CVR files, expect clear state
  await apiClient.clearCastVoteRecordFiles();
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual('unlocked');

  // now try loading official CVR files, as if after L&A
  const officialReportDirectoryName =
    'machine_0000__3000_ballots__2022-07-01_11-21-41';
  const officialExportTimestamp = '2022-07-01T11:21:41.000Z';
  const officialReportDirectoryPath = await modifyCastVoteRecordReport(
    castVoteRecordReport.asDirectoryPath(),
    () => ({
      ReportType: [CVRType.ReportType.OriginatingDeviceExport],
      OtherReportType: undefined,
    })
  );
  insertUsbDrive(
    mockCastVoteRecordFileTree(electionDefinition, {
      [officialReportDirectoryName]: officialReportDirectoryPath,
    })
  );
  const availableCastVoteRecordFiles2 =
    await apiClient.listCastVoteRecordFilesOnUsb();
  expect(availableCastVoteRecordFiles2).toMatchObject([
    expect.objectContaining({
      name: officialReportDirectoryName,
      cvrCount: 3000,
      exportTimestamp: new Date(officialExportTimestamp),
      isTestModeResults: false,
      scannerIds: ['0000'],
    }),
  ]);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.CvrFilesReadFromUsb,
    'system',
    {
      disposition: 'success',
      message: 'Found 1 CVR files on USB drive, user shown option to load.',
    }
  );

  const addLiveFileResult = await apiClient.addCastVoteRecordFile({
    path: availableCastVoteRecordFiles2[0]!.path,
  });
  assert(addLiveFileResult.isOk());
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.CvrLoaded,
    'election_manager',
    {
      disposition: 'success',
      filename: officialReportDirectoryName,
      message: expect.anything(),
      numberOfBallotsImported: 3000,
      duplicateBallotsIgnored: 0,
    }
  );
  removeUsbDrive();

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(3000);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual('official');
});

test('adding a duplicate file returns OK to client but logs an error', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // initially, no files
  expect(await apiClient.getCastVoteRecordFiles()).toEqual([]);

  const reportDirectoryPath = castVoteRecordReport.asDirectoryPath();

  // add file once
  (
    await apiClient.addCastVoteRecordFile({
      path: reportDirectoryPath,
    })
  ).assertOk('expected to load cast vote record report successfully');

  // try adding duplicate file
  const addDuplicateFileResult = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
  });
  assert(addDuplicateFileResult.isOk());
  expect(addDuplicateFileResult.ok()).toMatchObject({
    wasExistingFile: true,
    alreadyPresent: 3000,
    newlyAdded: 0,
    fileMode: 'test',
    fileName: basename(reportDirectoryPath),
  });
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(3000);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.CvrLoaded,
    'election_manager',
    expect.objectContaining({
      disposition: 'failure',
      filename: basename(reportDirectoryPath),
    })
  );
});

test('handles file with previously added entries by adding only the new entries', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const initialReportDirectoryPath = await modifyCastVoteRecordReport(
    castVoteRecordReport.asDirectoryPath(),
    ({ CVR }) => ({ CVR: CVR.take(10) })
  );
  // add file
  (
    await apiClient.addCastVoteRecordFile({
      path: initialReportDirectoryPath,
    })
  ).assertOk('expected to load cast vote record report successfully');
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(10);

  // create file that is duplicate but with new entries
  const laterReportDirectoryPath = await modifyCastVoteRecordReport(
    castVoteRecordReport.asDirectoryPath(),
    ({ CVR }) => ({ CVR: CVR.take(20) })
  );
  const addDuplicateEntriesResult = await apiClient.addCastVoteRecordFile({
    path: laterReportDirectoryPath,
  });
  assert(addDuplicateEntriesResult.isOk());
  expect(addDuplicateEntriesResult.ok()).toMatchObject({
    wasExistingFile: false,
    newlyAdded: 10,
    alreadyPresent: 10,
    fileMode: 'test',
    fileName: basename(laterReportDirectoryPath),
  });
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(2);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(20);
});

test('error if path to report is not valid', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const addNonExistentFileResult = await apiClient.addCastVoteRecordFile({
    path: '/tmp/does-not-exist',
  });
  expect(addNonExistentFileResult.err()).toEqual({
    type: 'report-access-failure',
    message: 'Failed to access cast vote record report for import.',
  });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.CvrLoaded,
    'election_manager',
    expect.objectContaining({
      disposition: 'failure',
      filename: 'does-not-exist',
    })
  );

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
});

test('error if report has invalid directory structure', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const reportDirectoryPath = castVoteRecordReport.asDirectoryPath();
  fs.rmSync(join(reportDirectoryPath, CVR_BALLOT_LAYOUTS_SUBDIRECTORY), {
    recursive: true,
    force: true,
  });

  const invalidReportStructureResult = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
  });

  expect(invalidReportStructureResult.err()).toMatchObject({
    type: 'invalid-report-structure',
    message: 'Cast vote record report has invalid file structure.',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
});

test('error if report metadata is not parseable', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const reportDirectoryPath = await modifyCastVoteRecordReport(
    castVoteRecordReport.asDirectoryPath(),
    () => ({
      ReportType: ['not-a-report-type'] as unknown as CVRType.ReportType[],
    })
  );

  const result = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
  });

  expect(result.err()).toMatchObject({
    type: 'malformed-report-metadata',
    message: 'Unable to parse cast vote record report, it may be malformed.',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
});

test('error if adding test report while in official mode', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  (
    await apiClient.addCastVoteRecordFile({
      path: await getOfficialReportPath(),
    })
  ).assertOk('expected to load cast vote record report successfully');

  const addTestReportResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });

  expect(addTestReportResult.isErr()).toBeTruthy();
  expect(addTestReportResult.err()).toMatchObject({
    type: 'invalid-report-file-mode',
    message:
      'You are currently tabulating official results but the selected cast vote record report contains test results.',
  });
});

test('error if adding official report while in test mode', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).assertOk('expected to load cast vote record report successfully');

  const addOfficialReportResult = await apiClient.addCastVoteRecordFile({
    path: await getOfficialReportPath(),
  });

  expect(addOfficialReportResult.isErr()).toBeTruthy();
  expect(addOfficialReportResult.err()).toMatchObject({
    type: 'invalid-report-file-mode',
    message:
      'You are currently tabulating test results but the selected cast vote record report contains official results.',
  });
});

test('error if a cast vote record not parseable', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  async function* badCastVoteRecordGenerator() {
    yield await Promise.resolve('not-a-cvr');
  }

  const reportDirectoryPath = await modifyCastVoteRecordReport(
    castVoteRecordReport.asDirectoryPath(),
    ({ CVR }) => ({
      CVR: CVR.take(10).chain(badCastVoteRecordGenerator()),
    })
  );

  const result = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
  });

  expect(result.err()).toMatchObject({
    type: 'malformed-cast-vote-record',
    message: 'Unable to parse cast vote record report, it may be malformed.',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
});

test('error if a cast vote record is somehow invalid', async () => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
  );
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const reportDirectoryPath = await modifyCastVoteRecordReport(
    castVoteRecordReport.asDirectoryPath(),
    ({ CVR }) => ({
      CVR: CVR.take(10).map((unparsed) => {
        return {
          ...safeParse(CVRType.CVRSchema, unparsed).unsafeUnwrap(),
          ElectionId: 'wrong-election',
        };
      }),
    })
  );

  const result = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
  });

  expect(result.err()).toMatchObject({
    type: 'invalid-cast-vote-record',
    message:
      'Found an invalid cast vote record at index 0 in the current report. The record references an election other than the current election.',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
});

test('error if cast vote records from different files share same ballot id but have different data', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).assertOk('expected to load cast vote record report successfully');

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(3000);

  const reportDirectoryPath = await modifyCastVoteRecordReport(
    castVoteRecordReport.asDirectoryPath(),
    ({ CVR }) => ({
      CVR: CVR.take(10).map((unparsed) => {
        return {
          ...safeParse(CVRType.CVRSchema, unparsed).unsafeUnwrap(),
          vxBallotType: vxBallotType.Provisional,
        };
      }),
    })
  );

  const result = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
  });

  expect(result.err()).toMatchObject({
    type: 'ballot-id-already-exists-with-different-data',
    message:
      'Found cast vote record at index 0 that has the same ballot id as a previously imported cast vote record, but with different data.',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(3000);
});

test('error if a layout is invalid', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const reportDirectoryPath = castVoteRecordReport.asDirectoryPath();

  // Overwrite a layout file with an invalid layout
  const layoutsDirectoryPath = join(
    reportDirectoryPath,
    CVR_BALLOT_LAYOUTS_SUBDIRECTORY
  );
  const batchDirectoryPath = join(
    layoutsDirectoryPath,
    fs.readdirSync(layoutsDirectoryPath)[0]!
  );
  fs.writeFileSync(
    join(batchDirectoryPath, fs.readdirSync(batchDirectoryPath)[0]!),
    '{}'
  );

  const result = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
  });

  expect(result.err()).toMatchObject({
    type: 'invalid-layout',
    message: /Unable to parse a layout associated with a ballot image. Path:/,
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
});
