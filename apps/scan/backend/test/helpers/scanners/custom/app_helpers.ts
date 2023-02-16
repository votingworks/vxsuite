import {
  buildMockInsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import { deferred, ok, Result } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import { fakeLogger, Logger } from '@votingworks/logging';
import {
  MockScannerClient,
  MockScannerClientOptions,
  ScannerClient,
} from '@votingworks/plustek-scanner';
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
  mockScanner: MockScannerClient;
  workspace: Workspace;
  mockUsb: MockUsb;
  logger: Logger;
  interpreter: PrecinctScannerInterpreter;
}> {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const logger = fakeLogger();
  const workspace =
    preconfiguredWorkspace ?? (await createWorkspace(tmp.dirSync().name));
  const mockScanner = new MockScannerClient({
    toggleHoldDuration: 100,
    passthroughDuration: 100,
    ...mockScannerOptions,
  });
  const deferredConnect = deferred<void>();
  async function createCustomClient(): Promise<Result<ScannerClient, Error>> {
    await mockScanner.connect();
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

export const ballotImages = {
  completeHmpb: [
    electionFamousNames2021Fixtures.handMarkedBallotCompletePage1.asFilePath(),
    electionFamousNames2021Fixtures.handMarkedBallotCompletePage2.asFilePath(),
  ],
  completeBmd: [
    electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath(),
    electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
  ],
  unmarkedHmpb: [
    electionFamousNames2021Fixtures.handMarkedBallotUnmarkedPage1.asFilePath(),
    electionFamousNames2021Fixtures.handMarkedBallotUnmarkedPage2.asFilePath(),
  ],
  wrongElection: [
    // A BMD ballot front from a different election
    sampleBallotImages.sampleBatch1Ballot1.asFilePath(),
    // Blank BMD ballot back
    electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
  ],
  // The interpreter expects two different image files, so we use two
  // different blank page images
  blankSheet: [
    sampleBallotImages.blankPage.asFilePath(),
    // Blank BMD ballot back
    electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
  ],
} as const;
