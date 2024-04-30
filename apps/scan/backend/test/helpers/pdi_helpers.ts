import * as grout from '@votingworks/grout';
import * as tmp from 'tmp';
import { Application } from 'express';
import {
  InsertedSmartCardAuthApi,
  buildMockInsertedSmartCardAuth,
} from '@votingworks/auth';
import {
  Listener,
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
import { Logger } from '@votingworks/logging';
import { Server } from 'http';
import { Result, deferred, ok } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { AddressInfo } from 'net';
import { SimulatedClock } from 'xstate/lib/SimulatedClock';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import { SheetOf } from '@votingworks/types';
import { createPrecinctScannerStateMachine } from '../../src/scanners/pdi/state_machine';
import { Workspace, createWorkspace } from '../../src/util/workspace';
import { Api, buildApp } from '../../src/app';
import { buildMockLogger } from './custom_helpers';
import {
  wrapFujitsuThermalPrinter,
  wrapLegacyPrinter,
} from '../../src/printing/printer';
import {
  expectStatus,
  waitForContinuousExportToUsbDrive,
  waitForStatus,
} from './shared_helpers';

export interface MockPdiScannerClient {
  emitEvent: (event: ScannerEvent) => void;
  setScannerStatus: (status: ScannerStatus) => void;
  client: jest.Mocked<ScannerClient>;
}

const baseStatus: ScannerStatus = {
  rearLeftSensorCovered: false,
  rearRightSensorCovered: false,
  branderPositionSensorCovered: false,
  hiSpeedMode: true,
  coverOpen: false,
  scannerEnabled: false,
  frontLeftSensorCovered: false,
  frontM1SensorCovered: false,
  frontM2SensorCovered: false,
  frontM3SensorCovered: false,
  frontM4SensorCovered: false,
  frontM5SensorCovered: false,
  frontRightSensorCovered: false,
  scannerReady: true,
  xmtAborted: false,
  documentJam: false,
  scanArrayPixelError: false,
  inDiagnosticMode: false,
  documentInScanner: false,
  calibrationOfUnitNeeded: false,
};

export const mockStatus = {
  idleScanningDisabled: baseStatus,
  idleScanningEnabled: {
    ...baseStatus,
    scannerEnabled: true,
  },
  documentInRear: {
    ...baseStatus,
    rearLeftSensorCovered: true,
    rearRightSensorCovered: true,
    documentInScanner: true,
  },
  documentInFront: {
    ...baseStatus,
    frontLeftSensorCovered: true,
    frontM1SensorCovered: true,
    frontM2SensorCovered: true,
    frontM3SensorCovered: true,
    frontM4SensorCovered: true,
    documentInScanner: true,
  },
  jammed: {
    ...baseStatus,
    rearLeftSensorCovered: true,
    frontLeftSensorCovered: true,
    frontM1SensorCovered: true,
    documentInScanner: true,
    documentJam: true,
  },
  coverOpen: {
    ...baseStatus,
    coverOpen: true,
  },
  jammedCoverOpen: {
    ...baseStatus,
    rearLeftSensorCovered: true,
    frontLeftSensorCovered: true,
    frontM1SensorCovered: true,
    documentInScanner: true,
    documentJam: true,
    coverOpen: true,
  },
  documentInFrontAndRear: {
    ...baseStatus,
    frontLeftSensorCovered: true,
    frontM1SensorCovered: true,
    frontM2SensorCovered: true,
    frontM3SensorCovered: true,
    frontM4SensorCovered: true,
    rearLeftSensorCovered: true,
    rearRightSensorCovered: true,
    documentInScanner: true,
  },
} satisfies Record<string, ScannerStatus>;

export function createMockPdiScannerClient(): MockPdiScannerClient {
  let listeners: Listener[] = [];
  const getScannerStatusMock = jest.fn();
  function setScannerStatus(status: ScannerStatus) {
    getScannerStatusMock.mockResolvedValue(ok(status));
  }
  setScannerStatus(mockStatus.idleScanningDisabled);
  return {
    emitEvent: (event: ScannerEvent) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
    setScannerStatus,
    client: {
      addListener: jest.fn((listener) => {
        listeners.push(listener);
        return listener;
      }),
      removeListener: jest.fn((listener) => {
        listeners = listeners.filter((l) => l !== listener);
      }),
      connect: jest.fn(),
      getScannerStatus: getScannerStatusMock,
      enableScanning: jest.fn().mockResolvedValue(ok()),
      disableScanning: jest.fn().mockResolvedValue(ok()),
      ejectDocument: jest.fn().mockResolvedValue(ok()),
      disconnect: jest.fn().mockResolvedValue(ok()),
      exit: jest.fn(),
    },
  };
}

export async function simulateScan(
  apiClient: grout.Client<Api>,
  mockScanner: MockPdiScannerClient,
  images: SheetOf<ImageData>
): Promise<void> {
  mockScanner.emitEvent({ event: 'scanStart' });
  await expectStatus(apiClient, { state: 'scanning' });
  mockScanner.setScannerStatus(mockStatus.documentInRear);
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
  const workspace = createWorkspace(tmp.dirSync().name);
  const logger = buildMockLogger(mockAuth, workspace);
  const mockUsbDrive = createMockUsbDrive();
  const mockPrinterHandler = createMockPrinterHandler();
  const mockFujitsuPrinterHandler = createMockFujitsuPrinterHandler();
  const printer = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.SCAN_USE_FUJITSU_PRINTER
  )
    ? wrapFujitsuThermalPrinter(mockFujitsuPrinterHandler.printer)
    : wrapLegacyPrinter(mockPrinterHandler.printer);

  const mockScanner = createMockPdiScannerClient();
  const deferredConnect = deferred<Result<void, ScannerError>>();
  mockScanner.client.connect.mockResolvedValueOnce(deferredConnect.promise);
  const clock = new SimulatedClock();
  const precinctScannerMachine = createPrecinctScannerStateMachine({
    auth: mockAuth,
    createScannerClient: () => mockScanner.client,
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
  completeBmd: async () => [
    await electionFamousNames2021Fixtures.machineMarkedBallotPage1.asImageData(),
    await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData(),
  ],
  overvoteHmpb: async () => [
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedOvervoteFront.asImageData(),
    await electionGridLayoutNewHampshireTestBallotFixtures.scanMarkedOvervoteBack.asImageData(),
  ],
  wrongElectionBmd: async () => [
    // A BMD ballot front from a different election
    await sampleBallotImages.sampleBatch1Ballot1.asImageData(),
    // Blank BMD ballot back
    await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData(),
  ],
  blankSheet: async () => [
    // The interpreter expects two different image files, so we use two
    // different blank page images
    await sampleBallotImages.blankPage.asImageData(),
    // Blank BMD ballot back
    await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData(),
  ],
} satisfies Record<string, () => Promise<SheetOf<ImageData>>>;
