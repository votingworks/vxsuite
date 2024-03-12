import { Buffer } from 'buffer';
import set from 'lodash.set';
import { assert, err, ok } from '@votingworks/basics';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryDefinition,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import {
  CVR,
  CVR as CVRType,
  CastVoteRecordExportFileName,
} from '@votingworks/types';
import path, { basename } from 'path';
import { vxBallotType } from '@votingworks/types/src/cdf/cast-vote-records';
import {
  BooleanEnvironmentVariableName,
  SCANNER_RESULTS_FOLDER,
  generateCastVoteRecordExportDirectoryName,
  generateElectionBasedSubfolderName,
  getFeatureFlagMock,
  getSheetCount,
} from '@votingworks/utils';
import { mockOf } from '@votingworks/test-utils';
import { Client } from '@votingworks/grout';
import { authenticateArtifactUsingSignatureFile } from '@votingworks/auth';
import {
  CastVoteRecordExportModifications,
  combineImageAndLayoutHashes,
  getImageHash,
  getLayoutHash,
  modifyCastVoteRecordExport,
} from '@votingworks/backend';
import { MockFileTree } from '@votingworks/usb-drive';
import {
  buildTestEnvironment,
  configureMachine,
  mockCastVoteRecordFileTree,
  mockElectionManagerAuth,
} from '../test/app';
import { Api } from './app';
import {
  ListCastVoteRecordExportsOnUsbDriveResult,
  listCastVoteRecordExportsOnUsbDrive,
} from './cast_vote_records';

jest.setTimeout(60_000);

jest.mock('@votingworks/auth', (): typeof import('@votingworks/auth') => ({
  ...jest.requireActual('@votingworks/auth'),
  authenticateArtifactUsingSignatureFile: jest.fn(),
}));

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
  mockOf(authenticateArtifactUsingSignatureFile).mockResolvedValue(ok());
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

const { electionDefinition, castVoteRecordExport } =
  electionGridLayoutNewHampshireTestBallotFixtures;

async function getOfficialReportPath(): Promise<string> {
  return await modifyCastVoteRecordExport(
    castVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordReportMetadataModifier: (castVoteRecordReportMetadata) => ({
        ...castVoteRecordReportMetadata,
        OtherReportType: undefined,
        ReportType: [CVRType.ReportType.OriginatingDeviceExport],
      }),
      numCastVoteRecordsToKeep: 10,
    }
  );
}

async function expectCastVoteRecordCount(
  apiClient: Client<Api>,
  count: number
): Promise<void> {
  expect(getSheetCount((await apiClient.getCardCounts())[0]!)).toEqual(count);
}

test('happy path - mock election flow', async () => {
  const { apiClient, auth, mockUsbDrive, logger } = buildTestEnvironment();
  const { usbDrive, insertUsbDrive, removeUsbDrive } = mockUsbDrive;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // initially, no files or cast vote records
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual('unlocked');
  usbDrive.status.expectRepeatedCallsWith().resolves({ status: 'no_drive' });
  expect(await apiClient.listCastVoteRecordFilesOnUsb()).toEqual([]);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.ListCastVoteRecordExportsOnUsbDrive,
    'election_manager',
    {
      disposition: 'failure',
      message: 'Error listing cast vote record exports on USB drive.',
      reason: 'no-usb-drive',
    }
  );

  // insert a USB drive
  const testExportDirectoryName = 'TEST__machine_0000__2022-09-24_18-00-00';
  const testExportTimestamp = '2024-03-11T20:46:02.105Z';
  insertUsbDrive(
    mockCastVoteRecordFileTree(electionDefinition, {
      [testExportDirectoryName]: castVoteRecordExport.asDirectoryPath(),
    })
  );
  const availableCastVoteRecordFiles =
    await apiClient.listCastVoteRecordFilesOnUsb();
  expect(availableCastVoteRecordFiles).toMatchObject([
    expect.objectContaining({
      name: testExportDirectoryName,
      cvrCount: 184,
      exportTimestamp: new Date(testExportTimestamp),
      isTestModeResults: true,
      scannerIds: ['0000'],
    }),
  ]);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.ListCastVoteRecordExportsOnUsbDrive,
    'election_manager',
    {
      disposition: 'success',
      message: 'Found 1 cast vote record export(s) on USB drive.',
    }
  );

  // add a file
  let exportDirectoryPath = availableCastVoteRecordFiles[0]!.path;
  const addTestFileResult = await apiClient.addCastVoteRecordFile({
    path: exportDirectoryPath,
  });
  assert(addTestFileResult.isOk());
  expect(addTestFileResult.ok()).toMatchObject({
    wasExistingFile: false,
    exportedTimestamp: testExportTimestamp,
    alreadyPresent: 0,
    newlyAdded: 184,
    fileMode: 'test',
    fileName: testExportDirectoryName,
  });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.ImportCastVoteRecordsComplete,
    'election_manager',
    {
      disposition: 'success',
      message: 'Successfully imported 184 cast vote record(s).',
      exportDirectoryPath,
    }
  );

  removeUsbDrive();

  // file and cast vote records should now be present
  expect(await apiClient.getCastVoteRecordFiles()).toEqual([
    expect.objectContaining({
      exportTimestamp: testExportTimestamp,
      filename: testExportDirectoryName,
      numCvrsImported: 184,
      precinctIds: ['town-id-00701-precinct'],
      scannerIds: ['VX-00-000'],
    }),
  ]);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual('test');
  await expectCastVoteRecordCount(apiClient, 184);

  // check write-in records were created
  expect(await apiClient.getWriteInAdjudicationQueue()).toHaveLength(80);

  // check scanner batches
  expect(await apiClient.getScannerBatches()).toEqual([
    expect.objectContaining({
      batchId: '9822c71014',
      label: '9822c71014',
      scannerId: 'VX-00-000',
    }),
  ]);

  // remove CVR files, expect clear state
  await apiClient.clearCastVoteRecordFiles();
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  await expectCastVoteRecordCount(apiClient, 0);

  expect(await apiClient.getCastVoteRecordFileMode()).toEqual('unlocked');

  const availableCastVoteRecordFiles3 =
    await apiClient.listCastVoteRecordFilesOnUsb();
  expect(availableCastVoteRecordFiles3).toMatchObject([]);

  // now try loading official CVR files, as if after L&A
  const officialExportDirectoryName = 'machine_0000__2022-09-24_18-00-00';
  const officialExportTimestamp = testExportTimestamp;
  const officialReportDirectoryPath = await modifyCastVoteRecordExport(
    castVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordReportMetadataModifier: (castVoteRecordReportMetadata) => ({
        ...castVoteRecordReportMetadata,
        OtherReportType: undefined,
        ReportType: [CVRType.ReportType.OriginatingDeviceExport],
      }),
    }
  );
  insertUsbDrive(
    mockCastVoteRecordFileTree(electionDefinition, {
      [officialExportDirectoryName]: officialReportDirectoryPath,
    })
  );
  const availableCastVoteRecordFiles2 =
    await apiClient.listCastVoteRecordFilesOnUsb();
  expect(availableCastVoteRecordFiles2).toMatchObject([
    expect.objectContaining({
      name: officialExportDirectoryName,
      cvrCount: 184,
      exportTimestamp: new Date(officialExportTimestamp),
      isTestModeResults: false,
      scannerIds: ['0000'],
    }),
  ]);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.ListCastVoteRecordExportsOnUsbDrive,
    'election_manager',
    {
      disposition: 'success',
      message: 'Found 1 cast vote record export(s) on USB drive.',
    }
  );

  exportDirectoryPath = availableCastVoteRecordFiles2[0]!.path;
  const addLiveFileResult = await apiClient.addCastVoteRecordFile({
    path: exportDirectoryPath,
  });
  assert(addLiveFileResult.isOk());
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.ImportCastVoteRecordsComplete,
    'election_manager',
    {
      disposition: 'success',
      message: 'Successfully imported 184 cast vote record(s).',
      exportDirectoryPath,
    }
  );
  removeUsbDrive();

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  await expectCastVoteRecordCount(apiClient, 184);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual('official');
});

test('adding a file with BMD cast vote records', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionTwoPartyPrimaryDefinition);
  mockElectionManagerAuth(auth, electionTwoPartyPrimaryDefinition.electionHash);

  const addTestFileResult = await apiClient.addCastVoteRecordFile({
    path: electionTwoPartyPrimaryFixtures.castVoteRecordExport.asDirectoryPath(),
  });
  assert(addTestFileResult.isOk());
  expect(addTestFileResult.ok()).toMatchObject({
    wasExistingFile: false,
    alreadyPresent: 0,
    newlyAdded: 112,
    fileMode: 'test',
  });

  // should now be able to retrieve the file
  expect(await apiClient.getCastVoteRecordFiles()).toEqual([
    expect.objectContaining({
      numCvrsImported: 112,
      precinctIds: ['precinct-1', 'precinct-2'],
      scannerIds: ['VX-00-000'],
    }),
  ]);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual('test');
  await expectCastVoteRecordCount(apiClient, 112);

  // check that no write-in records were created
  expect(await apiClient.getWriteInAdjudicationQueue()).toHaveLength(0);
});

test('handles duplicate exports', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // initially, no files
  expect(await apiClient.getCastVoteRecordFiles()).toEqual([]);

  const exportDirectoryPath = castVoteRecordExport.asDirectoryPath();

  // add file once
  (
    await apiClient.addCastVoteRecordFile({
      path: exportDirectoryPath,
    })
  ).assertOk('expected to load cast vote record report successfully');

  // try adding duplicate file
  const addDuplicateFileResult = await apiClient.addCastVoteRecordFile({
    path: exportDirectoryPath,
  });
  assert(addDuplicateFileResult.isOk());
  expect(addDuplicateFileResult.ok()).toMatchObject({
    wasExistingFile: true,
    alreadyPresent: 184,
    newlyAdded: 0,
    fileMode: 'test',
    fileName: basename(exportDirectoryPath),
  });
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  await expectCastVoteRecordCount(apiClient, 184);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.ImportCastVoteRecordsComplete,
    'election_manager',
    {
      disposition: 'success',
      message:
        'Successfully imported 0 cast vote record(s). Ignored 184 duplicate(s).',
      exportDirectoryPath,
    }
  );
});

test('handles file with previously added entries by adding only the new entries', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const initialReportDirectoryPath = await modifyCastVoteRecordExport(
    castVoteRecordExport.asDirectoryPath(),
    { numCastVoteRecordsToKeep: 10 }
  );
  // add file
  (
    await apiClient.addCastVoteRecordFile({
      path: initialReportDirectoryPath,
    })
  ).assertOk('expected to load cast vote record report successfully');
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  await expectCastVoteRecordCount(apiClient, 10);

  // create file that is duplicate but with new entries
  const laterReportDirectoryPath = await modifyCastVoteRecordExport(
    castVoteRecordExport.asDirectoryPath(),
    { numCastVoteRecordsToKeep: 20 }
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
  await expectCastVoteRecordCount(apiClient, 20);
});

test(
  'handles an export that is not a perfect duplicate of another export ' +
    'but ultimately does not contain any new cast vote records',
  async () => {
    const { apiClient, auth } = buildTestEnvironment();
    await configureMachine(apiClient, auth, electionDefinition);
    mockElectionManagerAuth(auth, electionDefinition.electionHash);

    const export1DirectoryPath = await modifyCastVoteRecordExport(
      castVoteRecordExport.asDirectoryPath(),
      { numCastVoteRecordsToKeep: 10 }
    );
    const export2DirectoryPath = await modifyCastVoteRecordExport(
      castVoteRecordExport.asDirectoryPath(),
      {
        castVoteRecordReportMetadataModifier: (
          castVoteRecordReportMetadata
        ) => {
          const modifiedGeneratedDate = new Date(
            castVoteRecordReportMetadata.GeneratedDate
          );
          modifiedGeneratedDate.setMinutes(
            modifiedGeneratedDate.getMinutes() + 10
          );
          return {
            ...castVoteRecordReportMetadata,
            GeneratedDate: modifiedGeneratedDate.toISOString(),
          };
        },
        numCastVoteRecordsToKeep: 10,
      }
    );

    expect(
      await apiClient.addCastVoteRecordFile({ path: export1DirectoryPath })
    ).toEqual(
      ok(
        expect.objectContaining({
          alreadyPresent: 0,
          fileMode: 'test',
          fileName: basename(export1DirectoryPath),
          newlyAdded: 10,
          wasExistingFile: false,
        })
      )
    );
    expect(
      await apiClient.addCastVoteRecordFile({ path: export2DirectoryPath })
    ).toEqual(
      ok(
        expect.objectContaining({
          alreadyPresent: 10,
          fileMode: 'test',
          fileName: basename(export2DirectoryPath),
          newlyAdded: 0,
          wasExistingFile: false,
        })
      )
    );

    // Ensure that the second export is returned when retrieving exports, even though no new cast
    // vote records were added because of it
    const castVoteRecordExports = await apiClient.getCastVoteRecordFiles();
    expect(castVoteRecordExports).toHaveLength(2);
  }
);

test('error if path to report is not valid', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const addNonExistentFileResult = await apiClient.addCastVoteRecordFile({
    path: '/tmp/does-not-exist',
  });
  expect(addNonExistentFileResult.err()).toEqual({
    type: 'metadata-file-not-found',
  });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.ImportCastVoteRecordsComplete,
    'election_manager',
    {
      disposition: 'failure',
      message: 'Error importing cast vote records.',
      exportDirectoryPath: '/tmp/does-not-exist',
      errorDetails: expect.stringContaining('metadata-file-not-found'),
    }
  );

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  await expectCastVoteRecordCount(apiClient, 0);
});

test('cast vote records authentication error', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  mockOf(authenticateArtifactUsingSignatureFile).mockResolvedValue(
    err(new Error('Whoa!'))
  );

  const exportDirectoryPath = castVoteRecordExport.asDirectoryPath();
  const result = await apiClient.addCastVoteRecordFile({
    path: exportDirectoryPath,
  });
  expect(result).toEqual(
    err({
      type: 'authentication-error',
    })
  );
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.ImportCastVoteRecordsComplete,
    'election_manager',
    {
      disposition: 'failure',
      message: 'Error importing cast vote records.',
      exportDirectoryPath,
      errorDetails: expect.stringContaining('authentication-error'),
    }
  );
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  await expectCastVoteRecordCount(apiClient, 0);
});

test('cast vote records authentication error ignored if SKIP_CAST_VOTE_RECORDS_AUTHENTICATION is enabled', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  mockOf(authenticateArtifactUsingSignatureFile).mockResolvedValue(
    err(new Error('Whoa!'))
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );

  const result = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  expect(result.isOk()).toEqual(true);
});

test('error if report metadata is not parseable', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const reportDirectoryPath = await modifyCastVoteRecordExport(
    castVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordReportMetadataModifier: (castVoteRecordReportMetadata) => ({
        ...castVoteRecordReportMetadata,
        ReportType: ['not-a-report-type' as CVRType.ReportType],
      }),
    }
  );

  const result = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
  });

  expect(result.err()).toMatchObject({
    type: 'metadata-file-parse-error',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  await expectCastVoteRecordCount(apiClient, 0);
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
    path: castVoteRecordExport.asDirectoryPath(),
  });

  expect(addTestReportResult.isErr()).toBeTruthy();
  expect(addTestReportResult.err()).toMatchObject({
    type: 'invalid-mode',
  });
});

test('error if adding official report while in test mode', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).assertOk('expected to load cast vote record report successfully');

  const addOfficialReportResult = await apiClient.addCastVoteRecordFile({
    path: await getOfficialReportPath(),
  });

  expect(addOfficialReportResult.isErr()).toBeTruthy();
  expect(addOfficialReportResult.err()).toMatchObject({
    type: 'invalid-mode',
  });
});

test('error if a cast vote record not parseable', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const reportDirectoryPath = await modifyCastVoteRecordExport(
    castVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: () => ({}) as unknown as CVR.CVR,
      numCastVoteRecordsToKeep: 10,
    }
  );

  const result = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
  });

  expect(result.err()).toMatchObject({
    type: 'invalid-cast-vote-record',
    subType: 'parse-error',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  await expectCastVoteRecordCount(apiClient, 0);
});

test('error if a cast vote record is somehow invalid', async () => {
  featureFlagMock.disableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
  );
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const reportDirectoryPath = await modifyCastVoteRecordExport(
    castVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (castVoteRecord) => ({
        ...castVoteRecord,
        ElectionId: 'wrong-election',
      }),
      numCastVoteRecordsToKeep: 10,
    }
  );

  const result = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
  });

  expect(result.err()).toMatchObject({
    type: 'invalid-cast-vote-record',
    subType: 'election-mismatch',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  await expectCastVoteRecordCount(apiClient, 0);
});

test('error if cast vote records from different files share same ballot id but have different data', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).assertOk('expected to load cast vote record report successfully');

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  await expectCastVoteRecordCount(apiClient, 184);

  const reportDirectoryPath = await modifyCastVoteRecordExport(
    castVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (castVoteRecord) => ({
        ...castVoteRecord,
        vxBallotType: vxBallotType.Provisional,
      }),
      numCastVoteRecordsToKeep: 10,
    }
  );

  const result = await apiClient.addCastVoteRecordFile({
    path: reportDirectoryPath,
  });

  expect(result.err()).toMatchObject({
    type: 'ballot-id-already-exists-with-different-data',
  });

  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  await expectCastVoteRecordCount(apiClient, 184);
});

test('specifying path to metadata file instead of path to export directory (for manual file selection)', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const importResult = await apiClient.addCastVoteRecordFile({
    path: path.join(
      castVoteRecordExport.asDirectoryPath(),
      CastVoteRecordExportFileName.METADATA
    ),
  });
  expect(importResult.isOk()).toEqual(true);
});

test.each<{
  description: string;
  setupFn?: () => void;
  modifications: CastVoteRecordExportModifications;
  expectedErrorSubType: string;
}>([
  {
    description: 'mismatched election',
    setupFn: () => {
      featureFlagMock.disableFeatureFlag(
        BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
      );
    },
    modifications: {
      castVoteRecordModifier: (castVoteRecord) => ({
        ...castVoteRecord,
        ElectionId: 'mismatched-election-hash',
      }),
      numCastVoteRecordsToKeep: 1,
    },
    expectedErrorSubType: 'election-mismatch',
  },
  {
    description: 'non-existent precinct',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) => ({
        ...castVoteRecord,
        BallotStyleUnitId: 'non-existent-precinct-id',
      }),
      numCastVoteRecordsToKeep: 1,
    },
    expectedErrorSubType: 'precinct-not-found',
  },
  {
    description: 'non-existent ballot style',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) => ({
        ...castVoteRecord,
        BallotStyleId: 'non-existent-ballot-style-id',
      }),
      numCastVoteRecordsToKeep: 1,
    },
    expectedErrorSubType: 'ballot-style-not-found',
  },
  {
    description: 'non-existent contest',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        set(
          castVoteRecord,
          'CVRSnapshot[0].CVRContest[0].ContestId',
          'non-existent-contest-id'
        ),
      numCastVoteRecordsToKeep: 1,
    },
    expectedErrorSubType: 'contest-not-found',
  },
  {
    description: 'incorrect image hash',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        castVoteRecord.BallotImage
          ? set(
              castVoteRecord,
              'BallotImage[0].Hash.Value',
              combineImageAndLayoutHashes(
                'badhash',
                getLayoutHash(castVoteRecord.BallotImage[0]!)
              )
            )
          : castVoteRecord,
      numCastVoteRecordsToKeep: 10,
    },
    expectedErrorSubType: 'incorrect-image-hash',
  },
  {
    description: 'incorrect layout file hash',
    modifications: {
      castVoteRecordModifier: (castVoteRecord) =>
        castVoteRecord.BallotImage
          ? set(
              castVoteRecord,
              'BallotImage[0].Hash.Value',
              combineImageAndLayoutHashes(
                getImageHash(castVoteRecord.BallotImage[0]!),
                'badhash'
              )
            )
          : castVoteRecord,
      numCastVoteRecordsToKeep: 10,
    },
    expectedErrorSubType: 'incorrect-layout-file-hash',
  },
])(
  'invalid cast vote record - $description',
  async ({ setupFn, modifications, expectedErrorSubType }) => {
    const { apiClient, auth } = buildTestEnvironment();
    await configureMachine(apiClient, auth, electionDefinition);
    mockElectionManagerAuth(auth, electionDefinition.electionHash);

    setupFn?.();
    const exportDirectoryPath = await modifyCastVoteRecordExport(
      castVoteRecordExport.asDirectoryPath(),
      modifications
    );

    expect(
      await apiClient.addCastVoteRecordFile({ path: exportDirectoryPath })
    ).toEqual(
      err({
        type: 'invalid-cast-vote-record',
        subType: expectedErrorSubType,
        index: expect.any(Number),
      })
    );
  }
);

test.each<{
  description: string;
  usbDriveContentGenerator: () => MockFileTree;
  expectedResult: ListCastVoteRecordExportsOnUsbDriveResult;
}>([
  {
    description: 'empty USB drive',
    usbDriveContentGenerator: () => ({}),
    expectedResult: ok([]),
  },
  {
    description: 'file where there should be a directory',
    usbDriveContentGenerator: () => {
      const electionSubDirectoryName = generateElectionBasedSubfolderName(
        electionDefinition.election,
        electionDefinition.electionHash
      );
      return {
        [electionSubDirectoryName]: {
          [SCANNER_RESULTS_FOLDER]: Buffer.of(),
        },
      };
    },
    expectedResult: err('found-file-instead-of-directory'),
  },
  {
    description:
      "directories that aren't export directories and empty export directories",
    usbDriveContentGenerator: () => {
      const electionSubDirectoryName = generateElectionBasedSubfolderName(
        electionDefinition.election,
        electionDefinition.electionHash
      );
      const emptyExportDirectoryName =
        generateCastVoteRecordExportDirectoryName({
          inTestMode: true,
          machineId: '0000',
        });
      const exportDirectoryName = generateCastVoteRecordExportDirectoryName({
        inTestMode: true,
        machineId: '0001',
      });
      return {
        [electionSubDirectoryName]: {
          [SCANNER_RESULTS_FOLDER]: {
            'not-an-export-directory-name': {}, // Should be ignored
            [emptyExportDirectoryName]: {}, // Should be ignored
            [exportDirectoryName]: castVoteRecordExport.asDirectoryPath(),
          },
        },
      };
    },
    expectedResult: ok([
      expect.objectContaining({ name: expect.stringContaining('0001') }),
    ]),
  },
])(
  'listCastVoteRecordExportsOnUsbDrive - $description',
  async ({ usbDriveContentGenerator, expectedResult }) => {
    const { apiClient, auth, mockUsbDrive } = buildTestEnvironment();
    await configureMachine(apiClient, auth, electionDefinition);
    mockElectionManagerAuth(auth, electionDefinition.electionHash);

    mockUsbDrive.insertUsbDrive(usbDriveContentGenerator());
    expect(
      await listCastVoteRecordExportsOnUsbDrive(
        mockUsbDrive.usbDrive,
        electionDefinition
      )
    ).toEqual(expectedResult);
  }
);
