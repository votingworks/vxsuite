import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  HP_LASER_PRINTER_CONFIG,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import { assert } from '@votingworks/basics';
import { tmpNameSync } from 'tmp';
import { LogEventId } from '@votingworks/logging';
import { Client } from '@votingworks/grout';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { Api } from './app';
import { BallotCountReportSpec } from './reports/ballot_count_report';

jest.setTimeout(60_000);

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
jest.mock('./util/get_current_time', () => ({
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
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
    BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

async function expectIdenticalSnapshotsAcrossExportMethods({
  apiClient,
  mockPrinterHandler,
  reportSpec,
  customSnapshotIdentifier,
}: {
  apiClient: Client<Api>;
  mockPrinterHandler: MemoryPrinterHandler;
  reportSpec: BallotCountReportSpec;
  customSnapshotIdentifier: string;
}) {
  const { pdf } = await apiClient.getBallotCountReportPreview(reportSpec);
  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier,
  });

  await apiClient.printBallotCountReport(reportSpec);
  const printPath = mockPrinterHandler.getLastPrintPath();
  assert(printPath !== undefined);
  await expect(printPath).toMatchPdfSnapshot({
    customSnapshotIdentifier,
  });

  const exportPath = tmpNameSync();
  const exportResult = await apiClient.exportBallotCountReportPdf({
    ...reportSpec,
    path: exportPath,
  });
  exportResult.assertOk('export failed');
  await expect(exportPath).toMatchPdfSnapshot({
    customSnapshotIdentifier,
  });
}

test('ballot count report PDF', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionTwoPartyPrimaryFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth, mockPrinterHandler } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  function snapshotReport({
    spec,
    identifier,
  }: {
    spec: BallotCountReportSpec;
    identifier: string;
  }) {
    return expectIdenticalSnapshotsAcrossExportMethods({
      apiClient,
      mockPrinterHandler,
      reportSpec: spec,
      customSnapshotIdentifier: identifier,
    });
  }

  // shows report with all zeros
  await snapshotReport({
    spec: {
      filter: {},
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
      includeSheetCounts: false,
    },
    identifier: 'ballot-count-report-zero',
  });

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  // shows report populated with data
  await snapshotReport({
    spec: {
      filter: {},
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
      includeSheetCounts: false,
    },
    identifier: 'ballot-count-report',
  });

  // applies filters and gives report specific title
  await snapshotReport({
    spec: {
      filter: { precinctIds: ['precinct-1'] },
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
      includeSheetCounts: false,
    },
    identifier: 'ballot-count-report-simple-filter',
  });

  // handles custom filters
  await snapshotReport({
    spec: {
      filter: {
        precinctIds: ['precinct-1'],
        votingMethods: ['precinct'],
        ballotStyleIds: ['1M'],
      },
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
      includeSheetCounts: false,
    },
    identifier: 'ballot-count-report-complex-filter',
  });

  // shows sheet counts
  await snapshotReport({
    spec: {
      filter: {},
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
      includeSheetCounts: true,
    },
    identifier: 'ballot-count-report-sheet-counts',
  });

  await apiClient.setManualResults({
    precinctId: 'precinct-1',
    ballotStyleId: '1M',
    votingMethod: 'precinct',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {},
    }),
  });

  // shows manual data
  await snapshotReport({
    spec: {
      filter: {},
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
      includeSheetCounts: false,
    },
    identifier: 'ballot-count-report-manual',
  });
});

test('ballot count report warning', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const { warning: noWarning } = await apiClient.getBallotCountReportPreview({
    filter: {},
    groupBy: {},
    includeSheetCounts: false,
  });
  expect(noWarning).toEqual({ type: 'none' });

  const { warning: noReportsMatchFilter } =
    await apiClient.getBallotCountReportPreview({
      filter: {},
      // grouping by batch is invalid because there are no batches
      groupBy: { groupByBatch: true },
      includeSheetCounts: false,
    });

  expect(noReportsMatchFilter).toEqual({ type: 'no-reports-match-filter' });
});

test('ballot count report logging', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;

  const { apiClient, auth, logger, mockPrinterHandler } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  const MOCK_REPORT_SPEC: BallotCountReportSpec = {
    filter: {},
    groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
    includeSheetCounts: false,
  };

  // successful file export
  const validTmpFilePath = tmpNameSync();
  const validExportResult = await apiClient.exportBallotCountReportPdf({
    ...MOCK_REPORT_SPEC,
    path: validTmpFilePath,
  });
  validExportResult.assertOk('export failed');
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'success',
    message: `Saved ballot count report PDF file to ${validTmpFilePath} on the USB drive.`,
    filename: validTmpFilePath,
  });

  // failed file export
  const invalidFilePath = '/invalid/path';
  const invalidExportResult = await apiClient.exportBallotCountReportPdf({
    ...MOCK_REPORT_SPEC,
    path: invalidFilePath,
  });
  invalidExportResult.assertErr('export should have failed');
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'failure',
    message: `Failed to save ballot count report PDF file to ${invalidFilePath} on the USB drive.`,
    filename: invalidFilePath,
  });

  // successful print
  await apiClient.printBallotCountReport(MOCK_REPORT_SPEC);
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPrinted,
    'election_manager',
    {
      message: `User printed a ballot count report.`,
      disposition: 'success',
    }
  );

  // failed print
  mockPrinterHandler.disconnectPrinter();
  await apiClient.printBallotCountReport(MOCK_REPORT_SPEC);
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPrinted,
    'election_manager',
    {
      message: `Error in attempting to print ballot count report: cannot print without printer connected`,
      disposition: 'failure',
    }
  );

  // preview
  await apiClient.getBallotCountReportPreview(MOCK_REPORT_SPEC);
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPreviewed,
    'election_manager',
    {
      message: `User previewed a ballot count report.`,
      disposition: 'success',
    }
  );
});
