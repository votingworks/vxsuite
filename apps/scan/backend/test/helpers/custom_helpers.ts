import { Buffer } from 'buffer';
import {
  InsertedSmartCardAuthApi,
  buildMockInsertedSmartCardAuth,
} from '@votingworks/auth';
import { Result, deferred, ok } from '@votingworks/basics';
import {
  CustomScanner,
  ErrorCode,
  ImageColorDepthType,
  ImageFileFormat,
  ImageFromScanner,
  ScanSide,
  mocks,
} from '@votingworks/custom-scanner';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireAmherstFixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import { getImageChannelCount } from '@votingworks/image-utils';
import { Logger, fakeLogger } from '@votingworks/logging';
import { SheetOf, mapSheet } from '@votingworks/types';
import { Application } from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import tmp from 'tmp';
import { createMockUsbDrive, MockUsbDrive } from '@votingworks/usb-drive';
import { Api, buildApp } from '../../src/app';
import { InterpretFn } from '../../src/interpret';
import {
  Delays,
  createPrecinctScannerStateMachine,
} from '../../src/scanners/custom/state_machine';
import { Workspace, createWorkspace } from '../../src/util/workspace';
import {
  expectStatus,
  waitForContinuousExportToUsbDrive,
  waitForStatus,
} from './shared_helpers';

export async function withApp(
  {
    delays = {},
    preconfiguredWorkspace,
    interpret,
  }: {
    delays?: Partial<Delays>;
    preconfiguredWorkspace?: Workspace;
    interpret?: InterpretFn;
  },
  fn: (context: {
    apiClient: grout.Client<Api>;
    app: Application;
    mockAuth: InsertedSmartCardAuthApi;
    mockScanner: jest.Mocked<CustomScanner>;
    workspace: Workspace;
    mockUsbDrive: MockUsbDrive;
    logger: Logger;
    server: Server;
  }) => Promise<void>
): Promise<void> {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const logger = fakeLogger();
  const workspace =
    preconfiguredWorkspace ?? createWorkspace(tmp.dirSync().name);
  const mockScanner = mocks.fakeCustomScanner();
  const mockUsbDrive = createMockUsbDrive();
  const deferredConnect = deferred<void>();
  async function createCustomClient(): Promise<
    Result<CustomScanner, ErrorCode>
  > {
    const connectResult = await mockScanner.connect();
    if (connectResult.isErr()) {
      return connectResult;
    }
    await deferredConnect.promise;
    return ok(mockScanner);
  }
  const precinctScannerMachine = createPrecinctScannerStateMachine({
    createCustomClient,
    workspace,
    interpret,
    logger,
    usbDrive: mockUsbDrive.usbDrive,
    delays: {
      DELAY_RECONNECT: 100,
      DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: 100,
      DELAY_ACCEPTED_RESET_TO_NO_PAPER: 200,
      DELAY_PAPER_STATUS_POLLING_INTERVAL: 50,
      ...delays,
    },
  });
  const app = buildApp(
    mockAuth,
    precinctScannerMachine,
    workspace,
    mockUsbDrive.usbDrive,
    logger
  );

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;

  const apiClient = grout.createClient<Api>({ baseUrl });

  await expectStatus(apiClient, { state: 'connecting' });
  deferredConnect.resolve();
  await waitForStatus(apiClient, { state: 'no_paper' });

  try {
    await fn({
      apiClient,
      app,
      mockAuth,
      mockScanner,
      workspace,
      mockUsbDrive,
      logger,
      server,
    });
    mockUsbDrive.assertComplete();
  } finally {
    await waitForContinuousExportToUsbDrive(mockUsbDrive);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    workspace.reset();
  }
}

function customSheetOfImagesFromScannerFromBallotImageData(
  ballotImageData: SheetOf<ImageData>
): SheetOf<ImageFromScanner> {
  return mapSheet(ballotImageData, (imageData, side): ImageFromScanner => {
    const channelCount = getImageChannelCount(imageData);
    const imageDepth =
      channelCount === 1
        ? ImageColorDepthType.Grey8bpp
        : ImageColorDepthType.Color24bpp;

    return {
      scanSide: side === 'front' ? ScanSide.A : ScanSide.B,
      imageBuffer: Buffer.from(imageData.data),
      imageWidth: imageData.width,
      imageHeight: imageData.height,
      imageFormat: ImageFileFormat.Jpeg,
      imageDepth,
      imageResolution: Math.round(imageData.width / 8.5),
    };
  });
}

export const ballotImages = {
  completeHmpb: async () =>
    customSheetOfImagesFromScannerFromBallotImageData([
      await electionGridLayoutNewHampshireAmherstFixtures.scanMarkedFront.asImageData(),
      await electionGridLayoutNewHampshireAmherstFixtures.scanMarkedBack.asImageData(),
    ]),
  completeBmd: async () =>
    customSheetOfImagesFromScannerFromBallotImageData([
      await electionFamousNames2021Fixtures.machineMarkedBallotPage1.asImageData(),
      await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData(),
    ]),
  overvoteHmpb: async () =>
    customSheetOfImagesFromScannerFromBallotImageData([
      await electionGridLayoutNewHampshireAmherstFixtures.scanMarkedOvervoteFront.asImageData(),
      await electionGridLayoutNewHampshireAmherstFixtures.scanMarkedOvervoteBack.asImageData(),
    ]),
  unmarkedHmpb: async () =>
    customSheetOfImagesFromScannerFromBallotImageData([
      await electionGridLayoutNewHampshireAmherstFixtures.scanUnmarkedFront.asImageData(),
      await electionGridLayoutNewHampshireAmherstFixtures.scanUnmarkedBack.asImageData(),
    ]),
  wrongElection: async () =>
    customSheetOfImagesFromScannerFromBallotImageData([
      // A BMD ballot front from a different election
      await sampleBallotImages.sampleBatch1Ballot1.asImageData(),
      // Blank BMD ballot back
      await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData(),
    ]),
  // The interpreter expects two different image files, so we use two
  // different blank page images
  blankSheet: async () =>
    customSheetOfImagesFromScannerFromBallotImageData([
      await sampleBallotImages.blankPage.asImageData(),
      // Blank BMD ballot back
      await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData(),
    ]),
} as const;

/**
 * To avoid race conditions within the state machine, its important that the
 * mock scanner immediately transition from READY_TO_SCAN to READY_TO_EJECT once
 * the scan command completes (simulating how the real scanner works). This
 * helper function implements that pattern.
 */
export function simulateScan(
  mockScanner: jest.Mocked<CustomScanner>,
  ballotImage: SheetOf<ImageFromScanner>
): void {
  let didScan = false;
  mockScanner.getStatus.mockImplementation(() => {
    if (!didScan) {
      return Promise.resolve(ok(mocks.MOCK_READY_TO_SCAN));
    }
    return Promise.resolve(ok(mocks.MOCK_READY_TO_EJECT));
  });
  mockScanner.scan.mockImplementationOnce(() => {
    didScan = true;
    return Promise.resolve(ok(ballotImage));
  });
}

export async function scanBallot(
  mockScanner: jest.Mocked<CustomScanner>,
  mockUsbDrive: MockUsbDrive,
  apiClient: grout.Client<Api>,
  initialBallotsCounted: number
): Promise<void> {
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, {
    state: 'ready_to_scan',
    ballotsCounted: initialBallotsCounted,
  });

  mockScanner.scan.mockResolvedValueOnce(ok(await ballotImages.completeBmd()));
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await waitForStatus(apiClient, {
    state: 'ready_to_accept',
    ballotsCounted: initialBallotsCounted,
    interpretation: { type: 'ValidSheet' },
  });

  await apiClient.acceptBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
  await waitForStatus(apiClient, {
    state: 'no_paper',
    ballotsCounted: initialBallotsCounted + 1,
  });

  await waitForContinuousExportToUsbDrive(mockUsbDrive);
}
