import { MockScannerClient, ScannerClient } from '@votingworks/plustek-sdk';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  ok,
  Result,
} from '@votingworks/types';
import { dirSync } from 'tmp';
import request from 'supertest';
import { Application } from 'express';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  BallotPackageEntry,
  readBallotPackageFromBuffer,
} from '@votingworks/utils';
import { Buffer } from 'buffer';
import waitForExpect from 'wait-for-expect';
import { Scan } from '@votingworks/api';
import { join } from 'path';
import { buildPrecinctScannerApp } from './precinct_scanner_app';
import { createPrecinctScannerStateMachine } from './precinct_scanner_state_machine';
import { createWorkspace } from './util/workspace';

jest.setTimeout(10_000);

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

async function expectStatus(
  app: Application,
  status: {
    state: Scan.PrecinctScannerState;
  } & Partial<Scan.PrecinctScannerStatus>
) {
  const response = await get(app, '/scanner/status');
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
  });
}

async function createApp() {
  const workspace = await createWorkspace(dirSync().name);
  const mockPlustek = new MockScannerClient({
    toggleHoldDuration: 100,
    passthroughDuration: 100,
  });
  async function createPlustekClient(): Promise<Result<ScannerClient, Error>> {
    await mockPlustek.connect();
    return ok(mockPlustek);
  }
  const precinctScannerMachine =
    createPrecinctScannerStateMachine(createPlustekClient);
  const app = buildPrecinctScannerApp(precinctScannerMachine, workspace);
  return { app, mockPlustek };
}

const famousNamesPath = join(
  __dirname,
  '../../../libs/fixtures/data/electionFamousNames2021/'
);
const sampleBallotImagesPath = join(__dirname, '../sample-ballot-images/');
const ballotImages = {
  completeHmpb: [
    join(famousNamesPath, 'hmpb-ballot-complete-p1.jpg'),
    join(famousNamesPath, 'hmpb-ballot-complete-p2.jpg'),
  ],
  completeBmd: [
    join(famousNamesPath, 'bmd-ballot-complete-p1.jpg'),
    join(famousNamesPath, 'bmd-ballot-complete-p2.jpg'),
  ],
  unmarkedHmpb: [
    join(famousNamesPath, 'hmpb-ballot-unmarked-p1.jpg'),
    join(famousNamesPath, 'hmpb-ballot-unmarked-p2.jpg'),
  ],
  wrongElection: [
    // A BMD ballot front from a different election
    join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.png'),
    // Blank BMD ballot back
    join(famousNamesPath, 'bmd-ballot-complete-p2.jpg'),
  ],
} as const;

async function configureApp(app: Application) {
  const { ballots, electionDefinition } = await readBallotPackageFromBuffer(
    electionFamousNames2021Fixtures.ballotPackageAsBuffer()
  );
  await expectStatus(app, { state: 'unconfigured' });

  await patch(app, '/config/election', electionDefinition.electionData);
  await patch(app, '/config/testMode', { testMode: false });
  // It takes about a second per template, so we only do some
  for (const ballot of ballots.slice(0, 2)) {
    await postTemplate(app, '/scan/hmpb/addTemplates', ballot);
  }
  await post(app, '/scan/hmpb/doneTemplates');
  await expectStatus(app, { state: 'no_paper' });
}

test('configure and scan hmpb', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.completeHmpb);
  await waitForStatus(app, { state: 'ready_to_scan' });

  const interpretation: Scan.InterpretationResult = {
    type: 'INTERPRETATION_VALID',
  };

  await post(app, '/scanner/scan');
  await expectStatus(app, { state: 'scanning' });
  await waitForStatus(app, { state: 'ready_to_accept', interpretation });

  await post(app, '/scanner/accept');
  await expectStatus(app, {
    state: 'accepting',
    interpretation,
    ballotsCounted: 1,
  });
  await waitForStatus(app, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });

  await post(app, '/scanner/wait-for-paper');
  await expectStatus(app, { state: 'no_paper', ballotsCounted: 1 });
});

test('configure and scan bmd ballot', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.completeBmd);
  await waitForStatus(app, { state: 'ready_to_scan' });

  const interpretation: Scan.InterpretationResult = {
    type: 'INTERPRETATION_VALID',
  };

  await post(app, '/scanner/scan');
  await expectStatus(app, { state: 'scanning' });
  await waitForStatus(app, { state: 'ready_to_accept', interpretation });

  await post(app, '/scanner/accept');
  await expectStatus(app, {
    state: 'accepting',
    interpretation,
    ballotsCounted: 1,
  });
  await waitForStatus(app, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });

  await post(app, '/scanner/wait-for-paper');
  await expectStatus(app, { state: 'no_paper', ballotsCounted: 1 });
});

function undervote(contestId: string, expected = 1): AdjudicationReasonInfo {
  return {
    type: AdjudicationReason.Undervote,
    contestId,
    optionIds: [],
    optionIndexes: [],
    expected,
  };
}
const needsReviewInterpretation: Scan.InterpretationResult = {
  type: 'INTERPRETATION_NEEDS_REVIEW',
  reasons: [
    undervote('mayor'),
    undervote('controller'),
    undervote('attorney'),
    undervote('public-works-director'),
    undervote('chief-of-police'),
    undervote('parks-and-recreation-director'),
    undervote('board-of-alderman', 4),
    undervote('city-council', 4),
  ],
};

test('ballot needs review - return', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb);
  await waitForStatus(app, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;

  await post(app, '/scanner/scan');
  await expectStatus(app, { state: 'scanning' });
  await waitForStatus(app, { state: 'needs_review', interpretation });

  await post(app, '/scanner/return');
  await expectStatus(app, { state: 'returning', interpretation });
  await waitForStatus(app, {
    state: 'returned',
    interpretation,
    ballotsCounted: 0,
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, { state: 'no_paper', ballotsCounted: 0 });
});

test('ballot needs review - accept', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb);
  await waitForStatus(app, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;

  await post(app, '/scanner/scan');
  await expectStatus(app, { state: 'scanning' });
  await waitForStatus(app, { state: 'needs_review', interpretation });

  await post(app, '/scanner/accept');
  await expectStatus(app, {
    state: 'accepting',
    interpretation,
    ballotsCounted: 1,
  });
  await waitForStatus(app, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });

  await post(app, '/scanner/wait-for-paper');
  await expectStatus(app, {
    state: 'no_paper',
    ballotsCounted: 1,
  });
});

test('ballot rejected', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.wrongElection);
  await waitForStatus(app, { state: 'ready_to_scan' });

  const interpretation: Scan.InterpretationResult = {
    type: 'INTERPRETATION_INVALID',
    reason: 'invalid_election_hash',
  };

  await post(app, '/scanner/scan');
  await expectStatus(app, { state: 'scanning' });
  await waitForStatus(app, {
    state: 'rejecting',
    interpretation,
  });
  await waitForStatus(app, {
    state: 'rejected',
    ballotsCounted: 0,
    interpretation,
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, { state: 'no_paper' });
});
