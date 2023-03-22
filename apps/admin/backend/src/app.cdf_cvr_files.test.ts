import { Admin } from '@votingworks/api';
import { assert } from '@votingworks/basics';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { CVR as CVRType, safeParse } from '@votingworks/types';
import { basename, join } from 'path';
import * as fs from 'fs';
import { CVR_BALLOT_LAYOUTS_SUBDIRECTORY } from '@votingworks/backend';
import { vxBallotType } from '@votingworks/types/src/cdf/cast-vote-records';
import {
  buildTestEnvironment,
  configureMachine,
  mockCastVoteRecordFileTree,
  mockElectionManagerAuth,
} from '../test/app';
import { modifyCastVoteRecordReport } from '../test/utils';

jest.setTimeout(30_000);

beforeEach(() => {
  jest.restoreAllMocks();
});

const { electionDefinition, standardCdfCvrReport } =
  electionMinimalExhaustiveSampleFixtures;

async function getOfficialReportPath(): Promise<string> {
  return await modifyCastVoteRecordReport(
    standardCdfCvrReport.asDirectoryPath(),
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
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual(
    Admin.CvrFileMode.Unlocked
  );
  expect(await apiClient.listCastVoteRecordFilesOnUsb()).toEqual([]);

  // insert a USB drive
  const { insertUsbDrive, removeUsbDrive } = mockUsb;
  const testReportDirectoryName =
    'TEST__machine_0000__3000_ballots__2022-07-01_11-21-41';
  const testExportTimestamp = '2022-07-01T11:21:41.000Z';
  insertUsbDrive(
    mockCastVoteRecordFileTree(electionDefinition, {
      [testReportDirectoryName]: standardCdfCvrReport.asDirectoryPath(),
    })
  );
  const availableCastVoteRecordFiles =
    await apiClient.listCastVoteRecordFilesOnUsb({ cvrImportFormat: 'cdf' });
  expect(availableCastVoteRecordFiles).toMatchObject([
    expect.objectContaining({
      name: testReportDirectoryName,
      cvrCount: 3000,
      exportTimestamp: testExportTimestamp,
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
    cvrImportFormatFromParams: 'cdf',
  });
  assert(addTestFileResult.isOk());
  expect(addTestFileResult.ok()).toMatchObject({
    wasExistingFile: false,
    exportedTimestamp: testExportTimestamp,
    alreadyPresent: 0,
    newlyAdded: 3000,
    scannerIds: ['scanner'],
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
      scannerIds: ['scanner'],
    }),
  ]);

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
        _scannerId: 'scanner',
        'best-animal-mammal': [],
        'zoo-council-mammal': [],
        'new-zoo-either': ['yes'],
        'new-zoo-pick': ['yes'],
        fishing: ['yes'],
      }),
    ])
  );

  expect(await apiClient.getCastVoteRecordFileMode()).toEqual(
    Admin.CvrFileMode.Test
  );

  // remove CVR files, expect clear state
  await apiClient.clearCastVoteRecordFiles();
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual(
    Admin.CvrFileMode.Unlocked
  );

  // now try loading official CVR files, as if after L&A
  const officialReportDirectoryName =
    'machine_0000__3000_ballots__2022-07-01_11-21-41';
  const officialExportTimestamp = '2022-07-01T11:21:41.000Z';
  const officialReportDirectoryPath = await modifyCastVoteRecordReport(
    standardCdfCvrReport.asDirectoryPath(),
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
    await apiClient.listCastVoteRecordFilesOnUsb({ cvrImportFormat: 'cdf' });
  expect(availableCastVoteRecordFiles2).toMatchObject([
    expect.objectContaining({
      name: officialReportDirectoryName,
      cvrCount: 3000,
      exportTimestamp: officialExportTimestamp,
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
    cvrImportFormatFromParams: 'cdf',
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
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual(
    Admin.CvrFileMode.Official
  );
});

test('adding a duplicate file returns OK to client but logs an error', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // initially, no files
  expect(await apiClient.getCastVoteRecordFiles()).toEqual([]);

  const reportDirectoryPath = standardCdfCvrReport.asDirectoryPath();

  // add file once
  await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
    cvrImportFormatFromParams: 'cdf',
  });

  // try adding duplicate file
  const addDuplicateFileResult = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
    cvrImportFormatFromParams: 'cdf',
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
    standardCdfCvrReport.asDirectoryPath(),
    ({ CVR }) => ({ CVR: CVR.take(10) })
  );
  // add file
  await apiClient.addCastVoteRecordFile({
    path: initialReportDirectoryPath,
    cvrImportFormatFromParams: 'cdf',
  });
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(10);

  // create file that is duplicate but with new entries
  const laterReportDirectoryPath = await modifyCastVoteRecordReport(
    standardCdfCvrReport.asDirectoryPath(),
    ({ CVR }) => ({ CVR: CVR.take(20) })
  );
  const addDuplicateEntriesResult = await apiClient.addCastVoteRecordFile({
    path: laterReportDirectoryPath,
    cvrImportFormatFromParams: 'cdf',
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
    cvrImportFormatFromParams: 'cdf',
  });
  expect(addNonExistentFileResult.err()).toMatchObject({
    type: 'invalid-file',
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

  const reportDirectoryPath = standardCdfCvrReport.asDirectoryPath();
  fs.rmSync(join(reportDirectoryPath, CVR_BALLOT_LAYOUTS_SUBDIRECTORY), {
    recursive: true,
    force: true,
  });

  const invalidReportStructureResult = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
    cvrImportFormatFromParams: 'cdf',
  });

  expect(invalidReportStructureResult.err()).toMatchObject({
    type: 'invalid-cdf-report',
    userFriendlyMessage: 'invalid-report-structure',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
});

test('error if report metadata is not parseable', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const reportDirectoryPath = await modifyCastVoteRecordReport(
    standardCdfCvrReport.asDirectoryPath(),
    () => ({
      ReportType: ['not-a-report-type'] as unknown as CVRType.ReportType[],
    })
  );

  const result = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
    cvrImportFormatFromParams: 'cdf',
  });

  expect(result.err()).toMatchObject({
    type: 'invalid-cdf-report',
    userFriendlyMessage: 'malformed-report-metadata',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
});

test('error if adding test report while in official mode', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  await apiClient.addCastVoteRecordFile({
    path: await getOfficialReportPath(),
    cvrImportFormatFromParams: 'cdf',
  });

  const addTestReportResult = await apiClient.addCastVoteRecordFile({
    path: standardCdfCvrReport.asDirectoryPath(),
    cvrImportFormatFromParams: 'cdf',
  });

  expect(addTestReportResult.isErr()).toBeTruthy();
  expect(addTestReportResult.err()).toMatchObject({
    type: 'invalid-cdf-report',
    userFriendlyMessage: 'invalid-report-file-mode',
  });
});

test('error if adding official report while in test mode', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  await apiClient.addCastVoteRecordFile({
    path: standardCdfCvrReport.asDirectoryPath(),
    cvrImportFormatFromParams: 'cdf',
  });

  const addOfficialReportResult = await apiClient.addCastVoteRecordFile({
    path: await getOfficialReportPath(),
    cvrImportFormatFromParams: 'cdf',
  });

  expect(addOfficialReportResult.isErr()).toBeTruthy();
  expect(addOfficialReportResult.err()).toMatchObject({
    type: 'invalid-cdf-report',
    userFriendlyMessage: 'invalid-report-file-mode',
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
    standardCdfCvrReport.asDirectoryPath(),
    ({ CVR }) => ({
      CVR: CVR.take(10).chain(badCastVoteRecordGenerator()),
    })
  );

  const result = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
    cvrImportFormatFromParams: 'cdf',
  });

  expect(result.err()).toMatchObject({
    type: 'invalid-cdf-report',
    userFriendlyMessage: 'malformed-cast-vote-record',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
});

test('error if a cast vote record is somehow invalid', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const reportDirectoryPath = await modifyCastVoteRecordReport(
    standardCdfCvrReport.asDirectoryPath(),
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
    cvrImportFormatFromParams: 'cdf',
  });

  expect(result.err()).toMatchObject({
    type: 'invalid-cdf-report',
    userFriendlyMessage: 'invalid-cast-vote-record',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
});

test('error if cast vote records from different files share same ballot id but have different data', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  await apiClient.addCastVoteRecordFile({
    path: standardCdfCvrReport.asDirectoryPath(),
    cvrImportFormatFromParams: 'cdf',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(3000);

  const reportDirectoryPath = await modifyCastVoteRecordReport(
    standardCdfCvrReport.asDirectoryPath(),
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
    cvrImportFormatFromParams: 'cdf',
  });

  expect(result.err()).toMatchObject({
    type: 'invalid-cdf-report',
    userFriendlyMessage: 'ballot-id-already-exists-with-different-data',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(3000);
});
