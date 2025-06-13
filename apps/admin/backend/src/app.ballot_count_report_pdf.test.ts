import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  HP_LASER_PRINTER_CONFIG,
  MemoryPrinterHandler,
  renderToPdf,
} from '@votingworks/printing';
import { assert, err } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import { Client } from '@votingworks/grout';
import { BallotStyleGroupId } from '@votingworks/types';
import { MockUsbDrive } from '@votingworks/usb-drive';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { Api } from './app';
import { BallotCountReportSpec } from './reports/ballot_count_report';
import { mockFileName } from '../test/csv';
import { generateReportPath } from './util/filenames';

vi.setConfig({
  testTimeout: 60_000,
});

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

vi.mock(import('@votingworks/printing'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    renderToPdf: vi.fn(original.renderToPdf),
  } as unknown as typeof import('@votingworks/printing');
});

beforeEach(() => {
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
  mockUsbDrive,
  reportSpec,
  customSnapshotIdentifier,
}: {
  apiClient: Client<Api>;
  mockPrinterHandler: MemoryPrinterHandler;
  mockUsbDrive: MockUsbDrive;
  reportSpec: BallotCountReportSpec;
  customSnapshotIdentifier: string;
}) {
  const { pdf } = await apiClient.getBallotCountReportPreview(reportSpec);
  await expect(pdf).toMatchPdfSnapshot({
    customSnapshotIdentifier,
    failureThreshold: 0.0001,
  });

  await apiClient.printBallotCountReport(reportSpec);
  const printPath = mockPrinterHandler.getLastPrintPath();
  assert(printPath !== undefined);
  await expect(printPath).toMatchPdfSnapshot({
    customSnapshotIdentifier,
    failureThreshold: 0.0001,
  });

  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();
  const filename = mockFileName('pdf');
  const exportResult = await apiClient.exportBallotCountReportPdf({
    ...reportSpec,
    filename,
  });
  exportResult.assertOk('export failed');
  const [filePath] = exportResult.unsafeUnwrap();
  await expect(filePath).toMatchPdfSnapshot({
    customSnapshotIdentifier,
    failureThreshold: 0.0001,
  });
}

test('ballot count report PDF', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { castVoteRecordExport } = electionTwoPartyPrimaryFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth, mockPrinterHandler, mockUsbDrive } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  mockUsbDrive.insertUsbDrive({});

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
      mockUsbDrive,
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
        ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[],
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
    ballotStyleGroupId: '1M' as BallotStyleGroupId,
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
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  expect(
    (
      await apiClient.getBallotCountReportPreview({
        filter: {},
        groupBy: {},
        includeSheetCounts: false,
      })
    ).warning
  ).toBeUndefined();

  expect(
    await apiClient.getBallotCountReportPreview({
      filter: {},
      // grouping by batch is invalid because there are no batches
      groupBy: { groupByBatch: true },
      includeSheetCounts: false,
    })
  ).toEqual({
    pdf: undefined,
    warning: { type: 'no-reports-match-filter' },
  });

  vi.mocked(renderToPdf).mockResolvedValueOnce(err('content-too-large'));
  expect(
    await apiClient.getBallotCountReportPreview({
      filter: {},
      groupBy: {},
      includeSheetCounts: false,
    })
  ).toEqual({
    pdf: undefined,
    warning: { type: 'content-too-large' },
  });
});

test('ballot count report logging', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  const { apiClient, auth, logger, mockPrinterHandler, mockUsbDrive } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  mockUsbDrive.insertUsbDrive({});

  const MOCK_REPORT_SPEC: BallotCountReportSpec = {
    filter: {},
    groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
    includeSheetCounts: false,
  };

  // successful file export
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();
  const validFilename = mockFileName('pdf');
  const validExportResult = await apiClient.exportBallotCountReportPdf({
    ...MOCK_REPORT_SPEC,
    filename: validFilename,
  });
  validExportResult.assertOk('export failed');
  const usbRelativeValidFilePath = generateReportPath(
    electionDefinition,
    validFilename
  );
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'success',
    message: `Saved ballot count report PDF file to ${usbRelativeValidFilePath} on the USB drive.`,
    path: usbRelativeValidFilePath,
  });

  // failed file export
  mockUsbDrive.removeUsbDrive();
  const invalidFilename = mockFileName('pdf');
  const invalidExportResult = await apiClient.exportBallotCountReportPdf({
    ...MOCK_REPORT_SPEC,
    filename: invalidFilename,
  });
  invalidExportResult.assertErr('export should have failed');
  const usbRelativeInvalidFilePath = generateReportPath(
    electionDefinition,
    invalidFilename
  );
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'failure',
    message: `Failed to save ballot count report PDF file to ${usbRelativeInvalidFilePath} on the USB drive.`,
    path: usbRelativeInvalidFilePath,
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
