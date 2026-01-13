import {
  InsertedSmartCardAuthApi,
  buildMockInsertedSmartCardAuth,
} from '@votingworks/auth';
import { Result, deferred, ok } from '@votingworks/basics';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import {
  electionFamousNames2021Fixtures,
  readElectionGeneralDefinition,
  sampleBallotImages,
} from '@votingworks/fixtures';
import {
  MemoryFujitsuPrinterHandler,
  createMockFujitsuPrinterHandler,
} from '@votingworks/fujitsu-thermal-printer';
import * as grout from '@votingworks/grout';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { ImageData } from '@votingworks/image-utils';
import { Logger, mockBaseLogger } from '@votingworks/logging';
import {
  Listener,
  ScannerClient,
  ScannerError,
  ScannerEvent,
  ScannerStatus,
  mockScannerStatus,
} from '@votingworks/pdi-scanner';
import { mapSheet, SheetOf } from '@votingworks/types';
import { MockUsbDrive, createMockUsbDrive } from '@votingworks/usb-drive';
import { Application } from 'express';
import { readFile } from 'node:fs/promises';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import * as tmp from 'tmp';
import { Mocked, expect, vi } from 'vitest';
import { SimulatedClock } from 'xstate/lib/SimulatedClock';
import { createCanvas } from 'canvas';
import { Api, buildApp } from '../../src/app';
import { Player as AudioPlayer } from '../../src/audio/player';
import {
  createPrecinctScannerStateMachine,
  delays,
} from '../../src/scanners/state_machine';
import { Store } from '../../src/store';
import { Workspace, createWorkspace } from '../../src/util/workspace';
import {
  buildMockLogger,
  expectStatus,
  pdfToImageSheet,
  waitForContinuousExportToUsbDrive,
  waitForStatus,
} from './shared_helpers';

vi.mock('./audio/player');

export interface MockPdiScannerClient {
  emitEvent: (event: ScannerEvent) => void;
  setScannerStatus: (status: ScannerStatus) => void;
  client: Mocked<ScannerClient>;
}

export function createMockPdiScannerClient(): MockPdiScannerClient {
  const getScannerStatusMock = vi.fn();
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
      addListener: vi.fn((listener) => {
        listeners.add(listener);
        return listener;
      }),
      removeListener: vi.fn((listener) => {
        listeners.delete(listener);
      }),
      connect: vi.fn(),
      getScannerStatus: getScannerStatusMock,
      enableScanning: vi.fn().mockResolvedValue(ok()),
      disableScanning: vi.fn().mockResolvedValue(ok()),
      ejectDocument: vi.fn().mockResolvedValue(ok()),
      calibrateDoubleFeedDetection: vi.fn().mockResolvedValue(ok()),
      getDoubleFeedDetectionCalibrationConfig: vi
        .fn()
        .mockRejectedValue(new Error('Not used')),
      calibrateImageSensors: vi.fn().mockResolvedValue(ok()),
      disconnect: vi.fn().mockResolvedValue(ok()),
      exit: vi.fn().mockResolvedValue(ok()),
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

export interface AppContext {
  apiClient: grout.Client<Api>;
  app: Application;
  mockAudioPlayer: Mocked<AudioPlayer>;
  mockAuth: Mocked<InsertedSmartCardAuthApi>;
  mockScanner: MockPdiScannerClient;
  workspace: Workspace;
  mockUsbDrive: MockUsbDrive;
  mockFujitsuPrinterHandler: MemoryFujitsuPrinterHandler;
  logger: Logger;
  server: Server;
  clock: SimulatedClock;
}

export async function withApp(
  fn: (context: AppContext) => Promise<void>
): Promise<void> {
  const mockAuth = buildMockInsertedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    tmp.dirSync().name,
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(mockAuth, workspace);
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.sync.expectOptionalRepeatedCallsWith().resolves(); // Called by continuous export
  const mockFujitsuPrinterHandler = createMockFujitsuPrinterHandler();
  const { printer } = mockFujitsuPrinterHandler;

  const mockScanner = createMockPdiScannerClient();
  const deferredConnect = deferred<Result<void, ScannerError>>();
  mockScanner.client.connect.mockReturnValueOnce(deferredConnect.promise);
  const clock = new SimulatedClock();
  const precinctScannerMachine = createPrecinctScannerStateMachine({
    auth: mockAuth,
    scannerClient: mockScanner.client,
    workspace,
    logger,
    usbDrive: mockUsbDrive.usbDrive,
    clock,
  });

  const mockAudioPlayer = vi.mocked(
    new AudioPlayer('development', logger, 'pci.stereo')
  );

  const app = buildApp({
    audioPlayer: mockAudioPlayer,
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
      mockAudioPlayer,
      mockAuth,
      mockScanner,
      workspace,
      mockUsbDrive,
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
  completeHmpb: async () =>
    pdfToImageSheet(
      Uint8Array.from(await readFile(vxFamousNamesFixtures.blankBallotPath))
    ),
  completeHmpbInvalidScale: async () => {
    const scale = 0.95;
    const sheet = await pdfToImageSheet(
      Uint8Array.from(await readFile(vxFamousNamesFixtures.blankBallotPath)),
      {
        scale: (200 / 72) * scale,
      }
    );
    const canvas = createCanvas(
      sheet[0].width / scale,
      sheet[0].height / scale
    );
    return mapSheet(sheet, (page) => {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(
        page,
        Math.round((canvas.width - page.width) / 2),
        Math.round((canvas.height - page.height) / 2)
      );
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    });
  },
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
  overvoteHmpb: async () =>
    pdfToImageSheet(
      Uint8Array.from(await readFile(vxFamousNamesFixtures.markedBallotPath))
    ),
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
  options: {
    waitForContinuousExportToUsbDrive?: boolean;
    ballotImages?: SheetOf<ImageData>;
  } = {}
): Promise<void> {
  clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
  await waitForStatus(apiClient, {
    state: 'no_paper',
    ballotsCounted: initialBallotsCounted,
  });
  await simulateScan(
    apiClient,
    mockScanner,
    options.ballotImages ?? (await ballotImages.completeBmd()),
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
  await apiClient.readyForNextBallot();
  await waitForStatus(apiClient, {
    state: 'no_paper',
    ballotsCounted: initialBallotsCounted + 1,
  });

  if (options.waitForContinuousExportToUsbDrive ?? true) {
    await waitForContinuousExportToUsbDrive(store);
  }
}
