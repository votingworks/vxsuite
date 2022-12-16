import {
  ALL_PRECINCTS_SELECTION,
  BallotPackageEntry,
  deferred,
  readBallotPackageFromBuffer,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import * as grout from '@votingworks/grout';
import { Application } from 'express';
import { Buffer } from 'buffer';
import request from 'supertest';
import { CastVoteRecord, ok, PrecinctId, Result } from '@votingworks/types';
import { Scan } from '@votingworks/api';
import waitForExpect from 'wait-for-expect';
import { fakeLogger, Logger } from '@votingworks/logging';
import {
  MockScannerClient,
  MockScannerClientOptions,
  ScannerClient,
} from '@votingworks/plustek-sdk';
import { dirSync } from 'tmp';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { join } from 'path';
import { AddressInfo } from 'net';
import fetch from 'node-fetch';
import { buildApp, Api } from '../../src/app';
import {
  createPrecinctScannerStateMachine,
  Delays,
} from '../../src/state_machine';
import {
  createInterpreter,
  PrecinctScannerInterpreter,
} from '../../src/interpret';
import { createWorkspace, Workspace } from '../../src/util/workspace';

// TODO(jonah) - Is there a way to ensure Grout always has access to node-fetch
// in a node environment?
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
global.fetch = fetch;

export function postTemplate(
  app: Application,
  path: string,
  ballot: BallotPackageEntry
): request.Test {
  return request(app)
    .post(path)
    .accept('application/json')
    .attach('ballots', Buffer.from(ballot.pdf), {
      filename: ballot.ballotConfig.filename,
      contentType: 'application/pdf',
    })
    .attach(
      'metadatas',
      Buffer.from(
        new TextEncoder().encode(JSON.stringify(ballot.ballotConfig))
      ),
      { filename: 'ballot-config.json', contentType: 'application/json' }
    )
    .attach(
      'layouts',
      Buffer.from(new TextEncoder().encode(JSON.stringify(ballot.layout))),
      {
        filename: ballot.ballotConfig.layoutFilename,
        contentType: 'application/json',
      }
    )
    .expect((res) => {
      // eslint-disable-next-line no-console
      if (res.status !== 200) console.error(res.body);
    })
    .expect(200, { status: 'ok' });
}

export async function postExportCvrs(
  app: Application
): Promise<CastVoteRecord[]> {
  const exportResponse = await request(app)
    .post('/precinct-scanner/export')
    .set('Accept', 'application/json')
    .expect(200);

  const cvrs: CastVoteRecord[] = exportResponse.text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line));
  return cvrs;
}

export async function expectStatus(
  apiClient: grout.Client<Api>,
  expectedStatus: {
    state: Scan.PrecinctScannerState;
  } & Partial<Scan.PrecinctScannerStatus>
): Promise<void> {
  const status = await apiClient.getScannerStatus();
  expect(status).toEqual({
    ballotsCounted: 0,
    // TODO canUnconfigure should probably not be part of this endpoint - it's
    // only needed on the admin screen
    canUnconfigure: !expectedStatus?.ballotsCounted,
    error: undefined,
    interpretation: undefined,
    ...expectedStatus,
  });
}

export async function waitForStatus(
  apiClient: grout.Client<Api>,
  status: {
    state: Scan.PrecinctScannerState;
  } & Partial<Scan.PrecinctScannerStatus>
): Promise<void> {
  await waitForExpect(async () => {
    await expectStatus(apiClient, status);
  }, 1_000);
}

export async function createApp(
  delays: Partial<Delays> = {},
  mockPlustekOptions: Partial<MockScannerClientOptions> = {}
): Promise<{
  apiClient: grout.Client<Api>;
  app: Application;
  mockPlustek: MockScannerClient;
  workspace: Workspace;
  logger: Logger;
  interpreter: PrecinctScannerInterpreter;
}> {
  const logger = fakeLogger();
  const workspace = await createWorkspace(dirSync().name);
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
  const app = buildApp(precinctScannerMachine, interpreter, workspace, logger);

  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;

  const apiClient = grout.createClient<Api>({ baseUrl });

  await expectStatus(apiClient, { state: 'connecting' });
  deferredConnect.resolve();
  await waitForStatus(apiClient, { state: 'no_paper' });
  return {
    apiClient,
    app,
    mockPlustek,
    workspace,
    logger,
    interpreter,
  };
}

const sampleBallotImagesPath = join(__dirname, '../../sample-ballot-images/');
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
    join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.png'),
    // Blank BMD ballot back
    electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
  ],
  // The interpreter expects two different image files, so we use two
  // different blank page images
  blankSheet: [
    join(sampleBallotImagesPath, 'blank-page.png'),
    // Blank BMD ballot back
    electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
  ],
} as const;

export async function configureApp(
  apiClient: grout.Client<Api>,
  app: Application,
  {
    addTemplates = false,
    precinctId,
  }: { addTemplates?: boolean; precinctId?: PrecinctId } = {
    addTemplates: false,
  }
): Promise<void> {
  const { ballots, electionDefinition } = await readBallotPackageFromBuffer(
    electionFamousNames2021Fixtures.ballotPackage.asBuffer()
  );
  await apiClient.setElection({
    electionData: electionDefinition.electionData,
  });
  if (addTemplates) {
    // It takes about a second per template, so we only do some
    for (const ballot of ballots.slice(0, 2)) {
      await postTemplate(app, '/precinct-scanner/config/addTemplates', ballot);
    }
  }
  await apiClient.setPrecinctSelection({
    precinctSelection: precinctId
      ? singlePrecinctSelectionFor(precinctId)
      : ALL_PRECINCTS_SELECTION,
  });
  await apiClient.setTestMode({ isTestMode: false });
  await apiClient.setPollsState({ pollsState: 'polls_open' });
}
