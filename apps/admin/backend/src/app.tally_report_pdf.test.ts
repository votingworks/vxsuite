import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
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
import { Client } from '@votingworks/grout';
import { LogEventId } from '@votingworks/logging';
import { BallotStyleGroupId } from '@votingworks/types';
import { MockUsbDrive } from '@votingworks/usb-drive';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { Api } from './app';
import { TallyReportSpec } from './reports/tally_report';
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
  reportSpec: TallyReportSpec;
  customSnapshotIdentifier: string;
}) {
  const { pdf } = await apiClient.getTallyReportPreview(reportSpec);
  await expect(pdf).toMatchPdfSnapshot({
    failureThreshold: 0.0001,
    customSnapshotIdentifier,
  });

  await apiClient.printTallyReport(reportSpec);
  const printPath = mockPrinterHandler.getLastPrintPath();
  assert(printPath !== undefined);
  await expect(printPath).toMatchPdfSnapshot({
    failureThreshold: 0.0001,
    customSnapshotIdentifier,
  });

  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();
  const filename = mockFileName('pdf');
  const exportResult = await apiClient.exportTallyReportPdf({
    ...reportSpec,
    filename,
  });
  const [filePath] = exportResult.unsafeUnwrap();
  await expect(filePath).toMatchPdfSnapshot({
    failureThreshold: 0.0001,
    customSnapshotIdentifier,
  });
}

// test split into two parts because it is long running
test('general election tally report PDF - Part 1', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();

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
    spec: TallyReportSpec;
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
      groupBy: {},
      includeSignatureLines: false,
    },
    identifier: 'tally-report-zero',
  });

  // shows report with signature
  await snapshotReport({
    spec: {
      filter: {},
      groupBy: {},
      includeSignatureLines: true,
    },
    identifier: 'tally-report-signature-line',
  });
});

test('general election tally report PDF - Part 2', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
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
    spec: TallyReportSpec;
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

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  // shows full election report populated with data
  await snapshotReport({
    spec: {
      filter: {},
      groupBy: {},
      includeSignatureLines: false,
    },
    identifier: 'tally-report',
  });

  // shows filtered report
  await snapshotReport({
    spec: {
      filter: { votingMethods: ['absentee'] },
      groupBy: {},
      includeSignatureLines: false,
    },
    identifier: 'tally-report-simple-filter',
  });

  // handles report with complex filter
  await snapshotReport({
    spec: {
      filter: {
        votingMethods: ['absentee'],
        precinctIds: ['town-id-00701-precinct-id-default'],
        ballotStyleGroupIds: ['card-number-3'] as BallotStyleGroupId[],
      },
      groupBy: {},
      includeSignatureLines: false,
    },
    identifier: 'tally-report-complex-filter',
  });

  // splits report according to group by
  await snapshotReport({
    spec: {
      filter: {},
      groupBy: { groupByVotingMethod: true },
      includeSignatureLines: false,
    },
    identifier: 'tally-report-grouped',
  });

  await apiClient.setManualResults({
    precinctId: 'town-id-00701-precinct-id-default',
    ballotStyleGroupId: 'card-number-3' as BallotStyleGroupId,
    votingMethod: 'absentee',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {
        'Governor-061a401b': {
          type: 'candidate',
          ballots: 10,
          officialOptionTallies: {
            'Josiah-Bartlett-1bb99985': 5,
            'Hannah-Dustin-ab4ef7c8': 3,
            'John-Spencer-9ffb5970': 2,
          },
        },
      },
    }),
  });

  // splits report according to group by
  await snapshotReport({
    spec: {
      filter: {},
      groupBy: {},
      includeSignatureLines: false,
    },
    identifier: 'tally-report-manual',
  });
});

test('tally report PDF - primary', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { castVoteRecordExport } = electionTwoPartyPrimaryFixtures;

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
    spec: TallyReportSpec;
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
      groupBy: {},
      includeSignatureLines: false,
    },
    identifier: 'primary-tally-report-zero',
  });

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  // shows report populated with data
  await snapshotReport({
    spec: {
      filter: {},
      groupBy: {},
      includeSignatureLines: false,
    },
    identifier: 'primary-tally-report',
  });
});

test('tally report warning', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  expect(
    (
      await apiClient.getTallyReportPreview({
        filter: {},
        groupBy: {},
        includeSignatureLines: false,
      })
    ).warning
  ).toBeUndefined();

  expect(
    await apiClient.getTallyReportPreview({
      filter: {},
      // grouping by batch is invalid because there are no batches
      groupBy: { groupByBatch: true },
      includeSignatureLines: false,
    })
  ).toEqual({
    pdf: undefined,
    warning: { type: 'no-reports-match-filter' },
  });

  vi.mocked(renderToPdf).mockResolvedValueOnce(err('content-too-large'));
  expect(
    await apiClient.getTallyReportPreview({
      filter: {},
      groupBy: {},
      includeSignatureLines: false,
    })
  ).toEqual({
    pdf: undefined,
    warning: { type: 'content-too-large' },
  });

  // testing for other cases is in `warnings.test.ts`, here we simply want to
  // confirm that the warning is being passed through
});

test('tally report logging', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  const { apiClient, auth, logger, mockPrinterHandler, mockUsbDrive } =
    buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  mockUsbDrive.insertUsbDrive({});

  const MOCK_REPORT_SPEC: TallyReportSpec = {
    filter: {},
    groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
    includeSignatureLines: false,
  };

  // successful file export
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();
  const validFilename = mockFileName('pdf');
  const validExportResult = await apiClient.exportTallyReportPdf({
    ...MOCK_REPORT_SPEC,
    filename: validFilename,
  });
  validExportResult.assertOk('export failed');
  const validUsbRelativeFilePath = generateReportPath(
    electionDefinition,
    validFilename
  );
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'success',
    message: `Saved tally report PDF file to ${validUsbRelativeFilePath} on the USB drive.`,
    path: validUsbRelativeFilePath,
  });

  // failed file export
  mockUsbDrive.removeUsbDrive();
  const invalidFilename = mockFileName('pdf');
  const invalidExportResult = await apiClient.exportTallyReportPdf({
    ...MOCK_REPORT_SPEC,
    filename: invalidFilename,
  });
  invalidExportResult.assertErr('export should have failed');
  const invalidUsbRelativeFilePath = generateReportPath(
    electionDefinition,
    invalidFilename
  );
  expect(logger.log).lastCalledWith(LogEventId.FileSaved, 'election_manager', {
    disposition: 'failure',
    message: `Failed to save tally report PDF file to ${invalidUsbRelativeFilePath} on the USB drive.`,
    path: invalidUsbRelativeFilePath,
  });

  // successful print
  await apiClient.printTallyReport(MOCK_REPORT_SPEC);
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPrinted,
    'election_manager',
    {
      message: `User printed a tally report.`,
      disposition: 'success',
    }
  );

  // failed print
  mockPrinterHandler.disconnectPrinter();
  await apiClient.printTallyReport(MOCK_REPORT_SPEC);
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPrinted,
    'election_manager',
    {
      message: `Error in attempting to print tally report: cannot print without printer connected`,
      disposition: 'failure',
    }
  );

  // preview
  await apiClient.getTallyReportPreview(MOCK_REPORT_SPEC);
  expect(logger.log).lastCalledWith(
    LogEventId.ElectionReportPreviewed,
    'election_manager',
    {
      message: `User previewed a tally report.`,
      disposition: 'success',
    }
  );
});
