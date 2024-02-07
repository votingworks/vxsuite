import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { assert } from '@votingworks/basics';
import { tmpNameSync } from 'tmp';
import { LogEventId } from '@votingworks/logging';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';

jest.setTimeout(60_000);

const reportPrintedTime = new Date('2021-01-01T00:00:00.000Z');
jest.mock('../util/get_current_time', () => ({
  getCurrentTime: () => reportPrintedTime.getTime(),
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
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('write-in adjudication report', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth, mockPrinterHandler } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const writeInContestId =
    'State-Representatives-Hillsborough-District-34-b1012d38';

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  async function expectIdenticalSnapshotsAcrossExportMethods(
    customSnapshotIdentifier: string
  ) {
    const preview = await apiClient.getWriteInAdjudicationReportPreview();
    await expect(preview).toMatchPdfSnapshot({
      customSnapshotIdentifier,
    });

    await apiClient.printWriteInAdjudicationReport();
    const printPath = mockPrinterHandler.getLastPrintPath();
    assert(printPath !== undefined);
    await expect(printPath).toMatchPdfSnapshot({
      customSnapshotIdentifier,
    });

    const exportPath = tmpNameSync();
    const exportResult = await apiClient.exportWriteInAdjudicationReportPdf({
      path: exportPath,
    });
    exportResult.assertOk('export failed');
    await expect(exportPath).toMatchPdfSnapshot({
      customSnapshotIdentifier,
    });
  }

  await expectIdenticalSnapshotsAcrossExportMethods('wia-report-zero');

  const writeInIds = await apiClient.getWriteInAdjudicationQueue({
    contestId: writeInContestId,
  });

  const unofficialCandidate1 = await apiClient.addWriteInCandidate({
    contestId: writeInContestId,
    name: 'Unofficial Candidate 1',
  });

  // generate some adjudication information
  for (const [i, writeInId] of writeInIds.entries()) {
    if (i < 24) {
      await apiClient.adjudicateWriteIn({
        writeInId,
        type: 'write-in-candidate',
        candidateId: unofficialCandidate1.id,
      });
    } else if (i < 48) {
      await apiClient.adjudicateWriteIn({
        writeInId,
        type: 'official-candidate',
        candidateId: 'Obadiah-Carrigan-5c95145a',
      });
    } else {
      await apiClient.adjudicateWriteIn({
        writeInId,
        type: 'invalid',
      });
    }
  }

  await expectIdenticalSnapshotsAcrossExportMethods('wia-report-adjudicated');

  // add manual data
  const unofficialCandidate2 = await apiClient.addWriteInCandidate({
    contestId: writeInContestId,
    name: 'Unofficial Candidate 2',
  });
  await apiClient.setManualResults({
    ballotStyleId: 'card-number-3',
    votingMethod: 'precinct',
    precinctId: 'town-id-00701-precinct-id-',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 25,
      contestResultsSummaries: {
        [writeInContestId]: {
          type: 'candidate',
          ballots: 25,
          overvotes: 3,
          undervotes: 2,
          writeInOptionTallies: {
            [unofficialCandidate1.id]: {
              name: 'Unofficial Candidate 1',
              tally: 6,
            },
            [unofficialCandidate2.id]: {
              name: 'Unofficial Candidate 2',
              tally: 4,
            },
          },
          officialOptionTallies: {
            'Obadiah-Carrigan-5c95145a': 10,
          },
        },
      },
    }),
  });

  await expectIdenticalSnapshotsAcrossExportMethods(
    'wia-report-adjudicated-plus-manual'
  );
});

test('write-in adjudication report logging', async () => {
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  const { apiClient, auth, logger, mockPrinterHandler } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  // successful file export
  const validTmpFilePath = tmpNameSync();
  const validExportResult = await apiClient.exportWriteInAdjudicationReportPdf({
    path: validTmpFilePath,
  });
  validExportResult.assertOk('export failed');
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'success',
    message: `Saved write-in adjudication report PDF file to ${validTmpFilePath} on the USB drive.`,
    filename: validTmpFilePath,
  });

  // failed file export
  const invalidFilePath = '/invalid/path';
  const invalidExportResult =
    await apiClient.exportWriteInAdjudicationReportPdf({
      path: invalidFilePath,
    });
  invalidExportResult.assertErr('export should have failed');
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'failure',
    message: `Failed to save write-in adjudication report PDF file to ${invalidFilePath} on the USB drive.`,
    filename: invalidFilePath,
  });

  // successful print
  await apiClient.printWriteInAdjudicationReport();
  expect(logger.log).lastCalledWith(
    LogEventId.TallyReportPrinted,
    'election_manager',
    {
      message: `User printed the write-in adjudication report.`,
      disposition: 'success',
    }
  );

  // failed print
  mockPrinterHandler.disconnectPrinter();
  await apiClient.printWriteInAdjudicationReport();
  expect(logger.log).lastCalledWith(
    LogEventId.TallyReportPrinted,
    'election_manager',
    {
      message: `Error in attempting to print the write-in adjudication report: cannot print without printer connected`,
      disposition: 'failure',
    }
  );

  // preview
  await apiClient.getWriteInAdjudicationReportPreview();
  expect(logger.log).lastCalledWith(
    LogEventId.TallyReportPreviewed,
    'election_manager',
    {
      message: `User previewed the write-in adjudication report.`,
      disposition: 'success',
    }
  );
});
