import {
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import { deferred, ok, Result } from '@votingworks/basics';
import {
  CustomScanner,
  ErrorCode,
  ImageColorDepthType,
  ImageFileFormat,
  ImageFromScanner,
  mocks,
  ScanSide,
} from '@votingworks/custom-scanner';
import {
  electionFamousNames2021Fixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import { getImageChannelCount } from '@votingworks/image-utils';
import { fakeLogger, Logger } from '@votingworks/logging';
import { MockScannerClientOptions } from '@votingworks/plustek-scanner';
import { mapSheet, SheetOf } from '@votingworks/types';
import { Buffer } from 'buffer';
import { Application } from 'express';
import tmp from 'tmp';
import { Api } from '../../../../src/app';
import {
  createInterpreter,
  PrecinctScannerInterpreter,
} from '../../../../src/interpret';
import {
  createPrecinctScannerStateMachine,
  Delays,
} from '../../../../src/scanners/custom/state_machine';
import { createWorkspace, Workspace } from '../../../../src/util/workspace';
import {
  createApp,
  createMockUsb,
  expectStatus,
  MockUsb,
  waitForStatus,
} from '../../app_helpers';

export async function createCustomScannerApp({
  delays = {},
  mockScannerOptions = {},
  preconfiguredWorkspace,
}: {
  delays?: Partial<Delays>;
  mockScannerOptions?: Partial<MockScannerClientOptions>;
  preconfiguredWorkspace?: Workspace;
} = {}): Promise<{
  apiClient: grout.Client<Api>;
  app: Application;
  mockAuth: InsertedSmartCardAuthApi;
  mockScanner: mocks.MockCustomScanner;
  workspace: Workspace;
  mockUsb: MockUsb;
  logger: Logger;
  interpreter: PrecinctScannerInterpreter;
}> {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const logger = fakeLogger();
  const workspace =
    preconfiguredWorkspace ?? (await createWorkspace(tmp.dirSync().name));
  const mockScanner = new mocks.MockCustomScanner({
    toggleHoldDuration: 100,
    passthroughDuration: 100,
    ...mockScannerOptions,
  });
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
  const interpreter = createInterpreter();
  const precinctScannerMachine = createPrecinctScannerStateMachine({
    createCustomClient,
    workspace,
    interpreter,
    logger,
    delays: {
      DELAY_RECONNECT: 100,
      DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: 100,
      DELAY_ACCEPTED_RESET_TO_NO_PAPER: 200,
      DELAY_PAPER_STATUS_POLLING_INTERVAL: 50,
      ...delays,
    },
  });
  const mockUsb = createMockUsb();

  const { app, apiClient } = await createApp({
    interpreter,
    logger,
    mockAuth,
    mockUsb,
    precinctScannerMachine,
    preconfiguredWorkspace: workspace,
  });

  await expectStatus(apiClient, { state: 'connecting' });
  deferredConnect.resolve();
  await waitForStatus(apiClient, { state: 'no_paper' });

  return {
    apiClient,
    app,
    mockAuth,
    mockScanner,
    workspace,
    mockUsb,
    logger,
    interpreter,
  };
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
      await electionFamousNames2021Fixtures.handMarkedBallotCompletePage1.asImageData(),
      await electionFamousNames2021Fixtures.handMarkedBallotCompletePage2.asImageData(),
    ]),
  completeBmd: async () =>
    customSheetOfImagesFromScannerFromBallotImageData([
      await electionFamousNames2021Fixtures.machineMarkedBallotPage1.asImageData(),
      await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData(),
    ]),
  unmarkedHmpb: async () =>
    customSheetOfImagesFromScannerFromBallotImageData([
      await electionFamousNames2021Fixtures.handMarkedBallotUnmarkedPage1.asImageData(),
      await electionFamousNames2021Fixtures.handMarkedBallotUnmarkedPage2.asImageData(),
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
