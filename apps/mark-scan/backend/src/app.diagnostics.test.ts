import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  ALL_PRECINCTS_SELECTION,
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import * as grout from '@votingworks/grout';
import { Server } from 'node:http';
import { LogEventId, Logger } from '@votingworks/logging';
import tmp from 'tmp';
import {
  BallotId,
  BallotType,
  DiagnosticRecord,
  PageInterpretation,
  SheetOf,
} from '@votingworks/types';
import {
  DiskSpaceSummary,
  getBatteryInfo,
  initializeGetWorkspaceDiskSpaceSummary,
  pdfToText,
} from '@votingworks/backend';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { MockPaperHandlerDriver } from '@votingworks/custom-paper-handler';
import { assertDefined, deferred, ok } from '@votingworks/basics';
import {
  InterpretFileResult,
  interpretSimplexBmdBallot,
} from '@votingworks/ballot-interpreter';
import { readElection } from '@votingworks/fs';
import { BLANK_PAGE_IMAGE_DATA } from '@votingworks/image-utils';
import { SimulatedClock } from 'xstate/lib/SimulatedClock';
import { Api } from './app';
import { PatConnectionStatusReader } from './pat-input/connection_status_reader';
import {
  configureApp,
  createApp,
  waitForStatus as waitForStatusHelper,
} from '../test/app_helpers';
import {
  delays,
  PaperHandlerStateMachine,
} from './custom-paper-handler/state_machine';
import { isAccessibleControllerDaemonRunning } from './util/hardware';
import { mockSystemAdminAuth } from '../test/auth_helpers';
import {
  DIAGNOSTIC_ELECTION_PATH,
  getDiagnosticMockBallotImagePath,
} from './custom-paper-handler/diagnostic';
import {
  loadAndParkPaper,
  scanAndSave,
} from './custom-paper-handler/application_driver';
import { BLANK_PAGE_MOCK } from '../test/ballot_helpers';

vi.setConfig({ testTimeout: 60_000 });

const TEST_POLLING_INTERVAL_MS = 5;

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

const MOCK_DISK_SPACE_SUMMARY: DiskSpaceSummary = {
  total: 10 * 1_000_000,
  used: 1 * 1_000_000,
  available: 9 * 1_000_000,
};

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  getBatteryInfo: vi.fn(),
  initializeGetWorkspaceDiskSpaceSummary: vi.fn(),
}));

vi.mock(import('./pat-input/connection_status_reader.js'));
vi.mock(import('./util/hardware.js'));
vi.mock(import('./custom-paper-handler/application_driver.js'));
vi.mock(import('@votingworks/ballot-interpreter'));

let apiClient: grout.Client<Api>;
let driver: MockPaperHandlerDriver;
let auth: InsertedSmartCardAuthApi;
let server: Server;
let stateMachine: PaperHandlerStateMachine;
let patConnectionStatusReader: PatConnectionStatusReader;
let mockUsbDrive: MockUsbDrive;
let logger: Logger;
let clock: SimulatedClock;

async function waitForStatus(
  status: string,
  interval = TEST_POLLING_INTERVAL_MS
): Promise<void> {
  await waitForStatusHelper(apiClient, interval, status);
}

beforeEach(async () => {
  vi.resetAllMocks();

  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  const mockWorkspaceDir = tmp.dirSync();

  patConnectionStatusReader = new PatConnectionStatusReader(
    logger,
    'bmd-150',
    mockWorkspaceDir.name
  );
  vi.mocked(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
    false
  );

  vi.mocked(initializeGetWorkspaceDiskSpaceSummary).mockReturnValue(() =>
    Promise.resolve(MOCK_DISK_SPACE_SUMMARY)
  );

  const result = await createApp({
    patConnectionStatusReader,
    pollingIntervalMs: TEST_POLLING_INTERVAL_MS,
  });
  apiClient = result.apiClient;
  auth = result.mockAuth;
  logger = result.logger;
  server = result.server;
  stateMachine = result.stateMachine;
  mockUsbDrive = result.mockUsbDrive;
  driver = result.driver;
  clock = result.clock;
});

afterEach(async () => {
  await stateMachine.cleanUp();
  server?.close();
});

test('diagnostic records', async () => {
  expect(
    await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'mark-scan-accessible-controller',
    })
  ).toBeNull();
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: 0,
  });
  await apiClient.addDiagnosticRecord({
    type: 'mark-scan-accessible-controller',
    outcome: 'fail',
    message: 'up button not working',
  });
  expect(
    await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'mark-scan-accessible-controller',
    })
  ).toEqual<DiagnosticRecord>({
    type: 'mark-scan-accessible-controller',
    outcome: 'fail',
    message: 'up button not working',
    timestamp: 0,
  });
  vi.setSystemTime(1000);
  await apiClient.addDiagnosticRecord({
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
  });
  expect(
    await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'mark-scan-accessible-controller',
    })
  ).toEqual<DiagnosticRecord>({
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
    timestamp: 1000,
  });

  vi.useRealTimers();
});

test('getApplicationDiskSpaceSummary', async () => {
  expect(await apiClient.getApplicationDiskSpaceSummary()).toEqual(
    MOCK_DISK_SPACE_SUMMARY
  );
});

test('getIsAccessibleControllerInputDetected', async () => {
  vi.mocked(isAccessibleControllerDaemonRunning).mockResolvedValueOnce(false);
  expect(await apiClient.getIsAccessibleControllerInputDetected()).toEqual(
    false
  );
  vi.mocked(isAccessibleControllerDaemonRunning).mockResolvedValueOnce(true);
  expect(await apiClient.getIsAccessibleControllerInputDetected()).toEqual(
    true
  );
});

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

test('saving the readiness report', async () => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: reportPrintedTime.getTime(),
  });
  await apiClient.addDiagnosticRecord({
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
  });
  await apiClient.addDiagnosticRecord({
    type: 'mark-scan-paper-handler',
    outcome: 'pass',
  });
  vi.mocked(isAccessibleControllerDaemonRunning).mockResolvedValueOnce(true);
  vi.mocked(getBatteryInfo).mockResolvedValue({
    level: 0.5,
    discharging: false,
  });
  vi.useRealTimers();

  await configureApp(apiClient, auth, mockUsbDrive);
  await apiClient.setPrecinctSelection({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();
  const exportResult = await apiClient.saveReadinessReport();
  expect(exportResult).toEqual(ok(expect.anything()));
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ReadinessReportSaved,
    {
      disposition: 'success',
      message: 'User saved the equipment readiness report to a USB drive.',
    }
  );

  const exportPath = exportResult.ok()![0];
  await expect(exportPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'readiness-report',
    failureThreshold: 0.0001,
  });

  const pdfContents = await pdfToText(exportPath);
  expect(pdfContents).toContain('VxMark Readiness Report');
  expect(pdfContents).toContain('Lincoln Municipal General Election');
  expect(pdfContents).toContain('All Precincts');
  expect(pdfContents).toContain('Free Disk Space: 90% (9 GB / 10 GB)');
  expect(pdfContents).toContain('Connected');

  mockUsbDrive.removeUsbDrive();
});

test('failure saving the readiness report', async () => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: reportPrintedTime.getTime(),
  });
  await apiClient.addDiagnosticRecord({
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
  });
  vi.mocked(isAccessibleControllerDaemonRunning).mockResolvedValueOnce(true);
  vi.mocked(getBatteryInfo).mockResolvedValue({
    level: 0.5,
    discharging: false,
  });
  vi.useRealTimers();

  mockUsbDrive.removeUsbDrive();
  const exportResult = await apiClient.saveReadinessReport();
  exportResult.assertErr('unexpected success');
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ReadinessReportSaved,
    {
      disposition: 'failure',
      message:
        'Error while attempting to save the equipment readiness report to a USB drive: No USB drive found',
    }
  );
});

describe('paper handler diagnostic', () => {
  test('success', async () => {
    const electionDefinition = (
      await readElection(DIAGNOSTIC_ELECTION_PATH)
    ).unsafeUnwrap();

    mockSystemAdminAuth(auth);

    const mockScanResult = deferred<string>();
    const scannedPath = await getDiagnosticMockBallotImagePath();
    vi.mocked(scanAndSave).mockReturnValue(mockScanResult.promise);

    const interpretationMock: SheetOf<InterpretFileResult> = [
      {
        interpretation: {
          type: 'InterpretedBmdPage',
          ballotId: '1_en' as BallotId,
          metadata: {
            ballotHash: 'hash',
            ballotType: BallotType.Precinct,
            ballotStyleId: electionDefinition.election.ballotStyles[0].id,
            precinctId: electionDefinition.election.precincts[0].id,
            isTestMode: true,
          },
          adjudicationInfo: {
            requiresAdjudication: false,
            ignoredReasonInfos: [],
            enabledReasonInfos: [],
            enabledReasons: [],
          },
          votes: {},
        },
        normalizedImage: BLANK_PAGE_IMAGE_DATA,
      },
      BLANK_PAGE_MOCK,
    ];
    const mockInterpretResult = deferred<SheetOf<InterpretFileResult>>();
    vi.mocked(interpretSimplexBmdBallot).mockReturnValue(
      mockInterpretResult.promise
    );

    driver.setMockStatus('noPaper');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);

    await apiClient.startPaperHandlerDiagnostic();
    await waitForStatus('paper_handler_diagnostic.prompt_for_paper');

    driver.setMockStatus('paperInserted');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('paper_handler_diagnostic.load_paper');

    driver.setMockStatus('paperParked');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('paper_handler_diagnostic.print_ballot_fixture');
    // Chromium, used by print_ballot_fixture, needs some time to spin up
    await waitForStatus('paper_handler_diagnostic.scan_ballot', 1000);

    mockScanResult.resolve(scannedPath);
    await waitForStatus('paper_handler_diagnostic.interpret_ballot');

    // Simulate a delay between the `ejectBallotToRear` call and the paper
    // getting ejected, by resolving without actually moving into the `noPaper`
    // state, to allow us to test for the`eject_to_rear` state
    // transition:
    vi.spyOn(driver, 'ejectBallotToRear').mockResolvedValue(true);

    mockInterpretResult.resolve(interpretationMock);
    await waitForStatus('paper_handler_diagnostic.eject_to_rear');

    driver.setMockStatus('noPaper');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await waitForStatus('paper_handler_diagnostic.success');

    const record = await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'mark-scan-paper-handler',
    });
    expect(assertDefined(record).outcome).toEqual('pass');
  });

  test('failure', async () => {
    mockSystemAdminAuth(auth);

    vi.mocked(loadAndParkPaper).mockRejectedValue('error');

    driver.setMockStatus('noPaper');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    await apiClient.startPaperHandlerDiagnostic();

    await waitForStatus('paper_handler_diagnostic.prompt_for_paper');

    driver.setMockStatus('paperInserted');
    clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
    // Error is hit as soon as paper is loaded
    await waitForStatus('paper_handler_diagnostic.failure');
    stateMachine.stopPaperHandlerDiagnostic();
    // State machine transitions back to its history state in the voting flow
    await waitForStatus('not_accepting_paper');

    const record = await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'mark-scan-paper-handler',
    });
    expect(assertDefined(record).outcome).toEqual('fail');
    expect(assertDefined(record).message).toEqual('An unknown error occurred.');
  });

  interface BadInterpretationTestSpec {
    interpretation: PageInterpretation;
    message: string;
  }

  const badInterpretationTests: BadInterpretationTestSpec[] = [
    {
      interpretation: {
        type: 'BlankPage',
      },
      message:
        'No ballot QR code detected. Ensure the page is inserted with the printable side up and try again.',
    },
    {
      interpretation: { type: 'UnreadablePage' },
      message: 'Unexpected test ballot interpretation: UnreadablePage',
    },
  ];

  test.each(badInterpretationTests)(
    'failure due to interpretation type: $interpretation.type',
    async ({ interpretation, message }) => {
      mockSystemAdminAuth(auth);

      const mockScanResult = deferred<string>();
      const scannedPath = await getDiagnosticMockBallotImagePath();
      vi.mocked(scanAndSave).mockReturnValue(mockScanResult.promise);

      const interpretationMock: SheetOf<InterpretFileResult> = [
        {
          interpretation,
          normalizedImage: BLANK_PAGE_IMAGE_DATA,
        },
        BLANK_PAGE_MOCK,
      ];
      const mockInterpretResult = deferred<SheetOf<InterpretFileResult>>();
      vi.mocked(interpretSimplexBmdBallot).mockReturnValue(
        mockInterpretResult.promise
      );

      driver.setMockStatus('noPaper');

      await apiClient.startPaperHandlerDiagnostic();
      await waitForStatus('paper_handler_diagnostic.prompt_for_paper');

      driver.setMockStatus('paperInserted');
      clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
      await waitForStatus('paper_handler_diagnostic.load_paper');

      driver.setMockStatus('paperParked');
      clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
      await waitForStatus('paper_handler_diagnostic.print_ballot_fixture');
      // Chromium, used by print_ballot_fixture, needs some time to spin up
      await waitForStatus('paper_handler_diagnostic.scan_ballot', 1000);

      mockScanResult.resolve(scannedPath);
      await waitForStatus('paper_handler_diagnostic.interpret_ballot');

      // Simulate a delay between the `ejectBallotToRear` call and the paper
      // getting ejected, by resolving without actually moving into the `noPaper`
      // state, to allow us to test for the`eject_to_rear` state
      // transition:
      vi.spyOn(driver, 'ejectBallotToRear').mockResolvedValue(true);

      mockInterpretResult.resolve(interpretationMock);

      clock.increment(delays.DELAY_PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS);
      await waitForStatus('paper_handler_diagnostic.failure');
      stateMachine.stopPaperHandlerDiagnostic();
      await waitForStatus('ejecting_to_front');
      const record = await apiClient.getMostRecentDiagnostic({
        diagnosticType: 'mark-scan-paper-handler',
      });
      expect(assertDefined(record).outcome).toEqual('fail');
      expect(assertDefined(record).message).toEqual(message);
    }
  );
});
