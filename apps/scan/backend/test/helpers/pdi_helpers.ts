import { ImageData } from '@votingworks/image-utils';
import * as grout from '@votingworks/grout';
import * as tmp from 'tmp';
import { Application } from 'express';
import {
  InsertedSmartCardAuthApi,
  buildMockInsertedSmartCardAuth,
} from '@votingworks/auth';
import {
  Listener,
  mockScannerStatus,
  ScannerClient,
  ScannerError,
  ScannerEvent,
  ScannerStatus,
} from '@votingworks/pdi-scanner';
import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import {
  MemoryPrinterHandler,
  createMockPrinterHandler,
} from '@votingworks/printing';
import {
  MemoryFujitsuPrinterHandler,
  createMockFujitsuPrinterHandler,
} from '@votingworks/fujitsu-thermal-printer';
import { Logger, mockBaseLogger } from '@votingworks/logging';
import { Server } from 'node:http';
import { Result, deferred, ok } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { AddressInfo } from 'node:net';
import { SimulatedClock } from 'xstate/lib/SimulatedClock';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
  readElectionGeneralDefinition,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { SheetOf } from '@votingworks/types';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import {
  createPrecinctScannerStateMachine,
  delays,
} from '../../src/scanners/pdi/state_machine';
import { Workspace, createWorkspace } from '../../src/util/workspace';
import { Api, buildApp } from '../../src/app';
import {
  wrapFujitsuThermalPrinter,
  wrapLegacyPrinter,
} from '../../src/printing/printer';
import {
  buildMockLogger,
  expectStatus,
  pdfToImageSheet,
  waitForContinuousExportToUsbDrive,
  waitForStatus,
} from './shared_helpers';
import { Store } from '../../src/store';

export interface MockPdiScannerClient {
  emitEvent: (event: ScannerEvent) => void;
  setScannerStatus: (status: ScannerStatus) => void;
  client: jest.Mocked<ScannerClient>;
}

export function createMockPdiScannerClient(): MockPdiScannerClient {
  const getScannerStatusMock = jest.fn();
  function setScannerStatus(status: ScannerStatus) {
    getScannerStatusMock.mockResolvedValue(ok(status));
  }
  setScannerStatus(mockScannerStatus.idleScanningDisabled);

  const listeners = new Set<Listener>();

  return {
    emitEvent: (event: ScannerEvent) => {
      // Snapshot the current set of listeners so that new listeners can be
      // added/removed as a side effect of calling a listener without also
      // receiving this event.
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
    setScannerStatus,
    client: {
      addListener: jest.fn((listener) => {
        listeners.add(listener);
        return listener;
      }),
      removeListener: jest.fn((listener) => {
        listeners.delete(listener);
      }),
      connect: jest.fn(),
      getScannerStatus: getScannerStatusMock,
      enableScanning: jest.fn().mockResolvedValue(ok()),
      disableScanning: jest.fn().mockResolvedValue(ok()),
      ejectDocument: jest.fn().mockResolvedValue(ok()),
      calibrateDoubleFeedDetection: jest.fn().mockResolvedValue(ok()),
      getDoubleFeedDetectionCalibrationConfig: jest
        .fn()
        .mockRejectedValue(new Error('Not used')),
      disconnect: jest.fn().mockResolvedValue(ok()),
      exit: jest.fn().mockResolvedValue(ok()),
    },
  };
}

export async function simulateScan(
  apiClient: grout.Client<Api>,
  mockScanner: MockPdiScannerClient,
  images: SheetOf<ImageData>,
  ballotsCounted = 0
): Promise<void> {
  mockScanner.emitEvent({ event: 'scanStart' });
  await expectStatus(apiClient, { state: 'scanning', ballotsCounted });
  mockScanner.setScannerStatus(mockScannerStatus.documentInRear);
  mockScanner.emitEvent({
    event: 'scanComplete',
    images,
  });
}

export async function withApp(
  fn: (context: {
    apiClient: grout.Client<Api>;
    app: Application;
    mockAuth: InsertedSmartCardAuthApi;
    mockScanner: MockPdiScannerClient;
    workspace: Workspace;
    mockUsbDrive: MockUsbDrive;
    mockPrinterHandler: MemoryPrinterHandler;
    mockFujitsuPrinterHandler: MemoryFujitsuPrinterHandler;
    logger: Logger;
    server: Server;
    clock: SimulatedClock;
  }) => Promise<void>
): Promise<void> {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const workspace = createWorkspace(tmp.dirSync().name, mockBaseLogger());
  const logger = buildMockLogger(mockAuth, workspace);
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.sync.expectOptionalRepeatedCallsWith().resolves(); // Called by continuous export
  const mockPrinterHandler = createMockPrinterHandler();
  const mockFujitsuPrinterHandler = createMockFujitsuPrinterHandler();
  const printer = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_BROTHER_PRINTER
  )
    ? wrapLegacyPrinter(mockPrinterHandler.printer)
    : wrapFujitsuThermalPrinter(mockFujitsuPrinterHandler.printer);

  const mockScanner = createMockPdiScannerClient();
  const deferredConnect = deferred<Result<void, ScannerError>>();
  mockScanner.client.connect.mockResolvedValueOnce(deferredConnect.promise);
  const clock = new SimulatedClock();
  const precinctScannerMachine = createPrecinctScannerStateMachine({
    auth: mockAuth,
    scannerClient: mockScanner.client,
    workspace,
    logger,
    usbDrive: mockUsbDrive.usbDrive,
    clock,
  });

  const app = buildApp({
    auth: mockAuth,
    machine: precinctScannerMachine,
    workspace,
    usbDrive: mockUsbDrive.usbDrive,
    printer,
    logger,
  });

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;

  const apiClient = grout.createClient<Api>({ baseUrl });

  await expectStatus(apiClient, { state: 'connecting' });
  deferredConnect.resolve(ok());
  // State machine should be paused since app is not configured
  await waitForStatus(apiClient, { state: 'paused' });

  try {
    await fn({
      apiClient,
      app,
      mockAuth,
      mockScanner,
      workspace,
      mockUsbDrive,
      mockPrinterHandler,
      mockFujitsuPrinterHandler,
      logger,
      server,
      clock,
    });
    mockUsbDrive.assertComplete();
  } finally {
    await waitForContinuousExportToUsbDrive(workspace.store);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    precinctScannerMachine.stop();
    workspace.reset();
  }
}

export const ballotImages = {
  completeHmpb: async () => [
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedFront.asImageData(),
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedBack.asImageData(),
  ],
  completeBmd: async () =>
    pdfToImageSheet(
      await renderBmdBallotFixture({
        electionDefinition:
          electionFamousNames2021Fixtures.readElectionDefinition(),
        ballotStyleId: DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
        precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
        votes: DEFAULT_FAMOUS_NAMES_VOTES,
      })
    ),
  overvoteHmpb: async () => [
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedOvervoteFront.asImageData(),
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedOvervoteBack.asImageData(),
  ],
  wrongElectionBmd: async () =>
    pdfToImageSheet(
      await renderBmdBallotFixture({
        electionDefinition: readElectionGeneralDefinition(),
      })
    ),
  blankSheet: async () => [
    await sampleBallotImages.blankPage.asImageData(),
    await sampleBallotImages.blankPage.asImageData(),
  ],
} satisfies Record<string, () => Promise<SheetOf<ImageData>>>;

export async function scanBallot(
  mockScanner: MockPdiScannerClient,
  clock: SimulatedClock,
  apiClient: grout.Client<Api>,
  store: Store,
  initialBallotsCounted: number,
  options: { waitForContinuousExportToUsbDrive?: boolean } = {}
): Promise<void> {
  clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
  await waitForStatus(apiClient, {
    state: 'no_paper',
    ballotsCounted: initialBallotsCounted,
  });
  await simulateScan(
    apiClient,
    mockScanner,
    await ballotImages.completeBmd(),
    initialBallotsCounted
  );
  await waitForStatus(apiClient, {
    state: 'accepting',
    ballotsCounted: initialBallotsCounted,
    interpretation: { type: 'ValidSheet' },
  });
  expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith('toRear');
  mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
  clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
  await waitForStatus(apiClient, {
    state: 'accepted',
    interpretation: { type: 'ValidSheet' },
    ballotsCounted: initialBallotsCounted + 1,
  });
  clock.increment(delays.DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT);
  await waitForStatus(apiClient, {
    state: 'no_paper',
    ballotsCounted: initialBallotsCounted + 1,
  });

  if (options.waitForContinuousExportToUsbDrive ?? true) {
    await waitForContinuousExportToUsbDrive(store);
  }
}
