import {
  InsertedSmartCardAuthApi,
  buildMockInsertedSmartCardAuth,
} from '@votingworks/auth';
import { Result, deferred, ok } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  sampleBallotImages,
} from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import { Logger, fakeLogger } from '@votingworks/logging';
import {
  MockScannerClient,
  MockScannerClientOptions,
  ScannerClient,
} from '@votingworks/plustek-scanner';
import { Buffer } from 'buffer';
import { Application } from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import tmp from 'tmp';
import { Api, buildApp } from '../../src/app';
import {
  PrecinctScannerInterpreter,
  createInterpreter,
} from '../../src/interpret';
import {
  Delays,
  createPrecinctScannerStateMachine,
} from '../../src/scanners/plustek/state_machine';
import { Usb } from '../../src/util/usb';
import { Workspace, createWorkspace } from '../../src/util/workspace';
import { createMockUsb, expectStatus, waitForStatus } from './shared_helpers';

type MockFileTree = MockFile | MockDirectory;
type MockFile = Buffer;
interface MockDirectory {
  [name: string]: MockFileTree;
}

interface MockUsb {
  insertUsbDrive(contents: MockFileTree): void;
  removeUsbDrive(): void;
  mock: jest.Mocked<Usb>;
}

export async function withApp(
  {
    delays = {},
    mockPlustekOptions = {},
    preconfiguredWorkspace,
  }: {
    delays?: Partial<Delays>;
    mockPlustekOptions?: Partial<MockScannerClientOptions>;
    preconfiguredWorkspace?: Workspace;
  },
  fn: (context: {
    apiClient: grout.Client<Api>;
    app: Application;
    mockAuth: InsertedSmartCardAuthApi;
    mockPlustek: MockScannerClient;
    workspace: Workspace;
    mockUsb: MockUsb;
    logger: Logger;
    interpreter: PrecinctScannerInterpreter;
    server: Server;
  }) => Promise<void>
): Promise<void> {
  const mockAuth = buildMockInsertedSmartCardAuth();
  const logger = fakeLogger();
  const workspace =
    preconfiguredWorkspace ?? (await createWorkspace(tmp.dirSync().name));
  const mockPlustek = new MockScannerClient({
    toggleHoldDuration: 100,
    passthroughDuration: 100,
    ...mockPlustekOptions,
  });
  const deferredConnect = deferred<void>();
  async function createPlustekClient(): Promise<Result<ScannerClient, Error>> {
    await mockPlustek.connect();
    await deferredConnect.promise;
    return ok(mockPlustek);
  }
  const interpreter = createInterpreter();
  const precinctScannerMachine = createPrecinctScannerStateMachine({
    createPlustekClient,
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
  const app = buildApp(
    mockAuth,
    precinctScannerMachine,
    interpreter,
    workspace,
    mockUsb.mock,
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
      mockPlustek,
      workspace,
      mockUsb,
      logger,
      interpreter,
      server,
    });
  } finally {
    const { promise, resolve, reject } = deferred<void>();
    server.close((error) => (error ? reject(error) : resolve()));
    await promise;
    void mockPlustek.stop();
    workspace.reset();
  }
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
