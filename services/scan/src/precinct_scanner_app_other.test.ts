import {
  MockScannerClient,
  MockScannerClientOptions,
  ScannerClient,
} from '@votingworks/plustek-sdk';
import {
  CastVoteRecord,
  ok,
  PollsState,
  PrecinctId,
  Result,
} from '@votingworks/types';
import { dirSync } from 'tmp';
import request from 'supertest';
import { Application } from 'express';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleSinglePrecinctDefinition,
} from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  BallotPackageEntry,
  deferred,
  readBallotPackageFromBuffer,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { Buffer } from 'buffer';
import waitForExpect from 'wait-for-expect';
import { Scan } from '@votingworks/api';
import { join } from 'path';
import { fakeLogger } from '@votingworks/logging';
import { buildPrecinctScannerApp } from './precinct_scanner_app';
import {
  createPrecinctScannerStateMachine,
  Delays,
} from './precinct_scanner_state_machine';
import { createWorkspace } from './util/workspace';
import { createInterpreter } from './precinct_scanner_interpreter';

jest.setTimeout(20_000);

function get(app: Application, path: string) {
  return request(app).get(path).accept('application/json').expect(200);
}

function patch(app: Application, path: string, body?: object | string) {
  return request(app)
    .patch(path)
    .accept('application/json')
    .set(
      'Content-Type',
      typeof body === 'string' ? 'application/octet-stream' : 'application/json'
    )
    .send(body)
    .expect((res) => {
      // eslint-disable-next-line no-console
      if (res.status !== 200) console.error(res.body);
    })
    .expect(200, { status: 'ok' });
}

function put(app: Application, path: string, body?: object | string) {
  return request(app)
    .put(path)
    .accept('application/json')
    .set(
      'Content-Type',
      typeof body === 'string' ? 'application/octet-stream' : 'application/json'
    )
    .send(body)
    .expect((res) => {
      // eslint-disable-next-line no-console
      if (res.status !== 200) console.error(res.body);
    })
    .expect(200, { status: 'ok' });
}

function post(app: Application, path: string, body?: object) {
  return request(app)
    .post(path)
    .accept('application/json')
    .send(body)
    .expect((res) => {
      // eslint-disable-next-line no-console
      if (res.status !== 200) console.error(res.body);
    })
    .expect(200, { status: 'ok' });
}

function postTemplate(
  app: Application,
  path: string,
  ballot: BallotPackageEntry
) {
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

function setAppPrecinct(app: Application, precinctId?: PrecinctId) {
  return put(app, '/precinct-scanner/config/precinct', {
    precinctSelection: precinctId
      ? singlePrecinctSelectionFor(precinctId)
      : ALL_PRECINCTS_SELECTION,
  });
}

function setPollsState(app: Application, pollsState: PollsState) {
  return put(app, '/precinct-scanner/config/polls', {
    pollsState,
  });
}

async function postExportCvrs(app: Application) {
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

async function expectStatus(
  app: Application,
  status: {
    state: Scan.PrecinctScannerState;
  } & Partial<Scan.PrecinctScannerStatus>
) {
  const response = await get(app, '/precinct-scanner/scanner/status');
  expect(response.body).toEqual({
    ballotsCounted: 0,
    // TODO canUnconfigure should probably not be part of this endpoint - it's
    // only needed on the admin screen
    canUnconfigure: !status?.ballotsCounted,
    error: undefined,
    interpretation: undefined,
    ...status,
  });
}

async function waitForStatus(
  app: Application,
  status: {
    state: Scan.PrecinctScannerState;
  } & Partial<Scan.PrecinctScannerStatus>
) {
  await waitForExpect(async () => {
    await expectStatus(app, status);
  }, 1_000);
}

async function createApp(
  delays: Partial<Delays> = {},
  mockPlustekOptions: Partial<MockScannerClientOptions> = {}
) {
  const logger = fakeLogger();
  const workspace = createWorkspace(dirSync().name);
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
  const app = await buildPrecinctScannerApp(
    precinctScannerMachine,
    interpreter,
    workspace
  );
  await expectStatus(app, { state: 'connecting' });
  deferredConnect.resolve();
  await waitForStatus(app, { state: 'no_paper' });
  return {
    app,
    mockPlustek,
    workspace,
    logger,
    interpreter,
  };
}

const sampleBallotImagesPath = join(__dirname, '../sample-ballot-images/');
const ballotImages = {
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

async function configureApp(
  app: Application,
  {
    addTemplates = false,
    precinctId,
  }: { addTemplates?: boolean; precinctId?: PrecinctId } = {
    addTemplates: false,
  }
) {
  const { ballots, electionDefinition } = await readBallotPackageFromBuffer(
    electionFamousNames2021Fixtures.ballotPackage.asBuffer()
  );
  await patch(
    app,
    '/precinct-scanner/config/election',
    electionDefinition.electionData
  );
  if (addTemplates) {
    // It takes about a second per template, so we only do some
    for (const ballot of ballots.slice(0, 2)) {
      await postTemplate(app, '/precinct-scanner/config/addTemplates', ballot);
    }
  }
  await setAppPrecinct(app, precinctId);
  await patch(app, '/precinct-scanner/config/testMode', { testMode: false });
  await setPollsState(app, 'polls_open');
}

async function scanBallot(
  mockPlustek: MockScannerClient,
  app: Application,
  initialBallotsCounted: number
) {
  await mockPlustek.simulateLoadSheet(ballotImages.completeBmd);
  await waitForStatus(app, {
    state: 'ready_to_scan',
    ballotsCounted: initialBallotsCounted,
  });

  const interpretation: Scan.SheetInterpretation = {
    type: 'ValidSheet',
  };

  await post(app, '/precinct-scanner/scanner/scan');
  await waitForStatus(app, {
    state: 'ready_to_accept',
    interpretation,
    ballotsCounted: initialBallotsCounted,
  });
  await post(app, '/precinct-scanner/scanner/accept');
  await waitForStatus(app, {
    ballotsCounted: initialBallotsCounted + 1,
    state: 'accepted',
    interpretation,
  });

  // Wait for transition back to no paper
  await waitForStatus(app, {
    state: 'no_paper',
    ballotsCounted: initialBallotsCounted + 1,
  });
}

test("setting the election also sets precinct if there's only one", async () => {
  const { app } = await createApp();
  await patch(
    app,
    '/precinct-scanner/config/election',
    electionMinimalExhaustiveSampleSinglePrecinctDefinition.electionData
  );
  const response = await get(app, '/precinct-scanner/config/precinct');
  expect(response.body.precinctSelection).toMatchObject({
    kind: 'SinglePrecinct',
    precinctId: 'precinct-1',
  });
});

describe('POST /precinct-scanner/export', () => {
  test('sets CVRs as backed up', async () => {
    const { app, workspace } = await createApp();
    const spySetCvrsBackedUp = jest.spyOn(workspace.store, 'setCvrsBackedUp');

    await configureApp(app);
    await request(app)
      .post('/precinct-scanner/export')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send({ skipImages: true })
      .expect(200);

    expect(spySetCvrsBackedUp).toHaveBeenCalledWith();
  });
});

describe('PUT /precinct-scanner/config/precinct', () => {
  test('will return error status if ballots have been cast', async () => {
    const { app, mockPlustek } = await createApp();
    await configureApp(app);
    await scanBallot(mockPlustek, app, 0);

    await request(app)
      .put('/precinct-scanner/config/precinct')
      .set('Content-Type', 'application/json')
      .send({ precinctSelection: singlePrecinctSelectionFor('whatever') })
      .expect(400);
  });

  test('will reset polls to closed', async () => {
    const { app, workspace } = await createApp();
    await configureApp(app);

    workspace.store.setPollsState('polls_open');
    await setAppPrecinct(app, '21');
    expect(workspace.store.getPollsState()).toEqual('polls_closed_initial');
  });
});

test('ballot batching', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);
  // Scan two ballots
  await scanBallot(mockPlustek, app, 0);
  await scanBallot(mockPlustek, app, 1);

  // Scan another ballot after pausing and unpausing polls
  await setPollsState(app, 'polls_paused');
  await setPollsState(app, 'polls_open');
  await scanBallot(mockPlustek, app, 2);

  const cvrs = await postExportCvrs(app);
  expect(cvrs.length).toBe(3);
  expect(cvrs[0]._batchId).toEqual(cvrs[1]._batchId);
  expect(cvrs[0]._batchId).not.toEqual(cvrs[2]._batchId);
});
