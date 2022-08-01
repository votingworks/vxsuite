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

  // Test transitioning back to no_paper
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

  // Test scanning again without first transitioning back to no_paper
  await mockPlustek.simulateLoadSheet(ballotImages.completeBmd);
  await waitForStatus(app, { state: 'ready_to_scan', ballotsCounted: 1 });
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

// TODO test all the invalid ballot reasons?
test('invalid ballot rejected', async () => {
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

test('scanner powered off while waiting for paper', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  mockPlustek.simulatePowerOff();
  await waitForStatus(app, { state: 'disconnected' });

  mockPlustek.simulatePowerOn();
  await waitForStatus(app, { state: 'no_paper' });
});

test('scanner powered off while scanning', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.completeBmd);
  await waitForStatus(app, { state: 'ready_to_scan' });

  await post(app, '/scanner/scan');
  await expectStatus(app, { state: 'scanning' });
  mockPlustek.simulatePowerOff();
  await waitForStatus(app, { state: 'disconnected', error: 'plustek_error' });

  mockPlustek.simulatePowerOn('jam');
  await waitForStatus(app, { state: 'jammed', error: 'plustek_error' });
});

test('scanner powered off while accepting', async () => {
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
  mockPlustek.simulatePowerOff();
  await post(app, '/scanner/accept');
  await waitForStatus(app, {
    state: 'disconnected',
    error: 'plustek_error',
    // TODO canUnconfigure should be true, but this will be fixed when we stop
    // optimistically counting ballots
    canUnconfigure: false,
  });

  mockPlustek.simulatePowerOn('ready_to_eject');
  await waitForStatus(app, {
    state: 'rejecting',
    error: 'paper_in_back_on_startup',
    canUnconfigure: false,
  });
  await waitForStatus(app, {
    state: 'rejected',
    error: 'paper_in_back_on_startup',
    canUnconfigure: false,
  });
});

test('scanner powered off after accepting', async () => {
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
  await waitForStatus(app, {
    state: 'accepting',
    interpretation,
    ballotsCounted: 1,
  });
  await waitForStatus(app, {
    state: 'accepted',
    interpretation,
    ballotsCounted: 1,
  });

  mockPlustek.simulatePowerOff();
  await waitForStatus(app, {
    state: 'disconnected',
    ballotsCounted: 1,
  });

  mockPlustek.simulatePowerOn('no_paper');
  await waitForStatus(app, { state: 'no_paper', ballotsCounted: 1 });
});

test('scanner powered off while rejecting', async () => {
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
  await waitForStatus(app, { state: 'rejecting', interpretation });

  mockPlustek.simulatePowerOff();
  await waitForStatus(app, { state: 'disconnected' });

  mockPlustek.simulatePowerOn('jam');
  await waitForStatus(app, { state: 'jammed' });
});

test('scanner powered off while returning', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb);
  await waitForStatus(app, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;

  await post(app, '/scanner/scan');
  await expectStatus(app, { state: 'scanning' });
  await waitForStatus(app, { state: 'needs_review', interpretation });

  await post(app, '/scanner/return');
  await waitForStatus(app, { state: 'returning', interpretation });

  mockPlustek.simulatePowerOff();
  await waitForStatus(app, { state: 'disconnected' });

  mockPlustek.simulatePowerOn('jam');
  await waitForStatus(app, { state: 'jammed' });
});

test('insert second ballot while first ballot is scanning', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.completeBmd);
  await waitForStatus(app, { state: 'ready_to_scan' });

  await post(app, '/scanner/scan');
  await expectStatus(app, { state: 'scanning' });

  await mockPlustek.simulateLoadSheet(ballotImages.completeBmd);
  await expectStatus(app, {
    state: 'both_sides_have_paper',
    error: 'both_sides_have_paper',
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, {
    state: 'rejecting',
    error: 'both_sides_have_paper',
  });
  await waitForStatus(app, {
    state: 'rejected',
    error: 'both_sides_have_paper',
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, { state: 'no_paper' });
});

test('insert second ballot before first ballot accept', async () => {
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
  await mockPlustek.simulateLoadSheet(ballotImages.completeBmd);
  await post(app, '/scanner/accept');

  await waitForStatus(app, {
    state: 'both_sides_have_paper',
    error: 'both_sides_have_paper',
    ballotsCounted: 0,
    interpretation,
    // TODO canUnconfigure should be true, but this will be fixed when we stop
    // optimistically counting ballots
    canUnconfigure: false,
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, {
    state: 'rejecting',
    error: 'both_sides_have_paper',
    interpretation,
    canUnconfigure: false,
  });
  await waitForStatus(app, {
    state: 'rejected',
    error: 'both_sides_have_paper',
    interpretation,
    canUnconfigure: false,
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, { state: 'no_paper', canUnconfigure: false });
});

test('insert second ballot while first ballot is rejecting', async () => {
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
  await waitForStatus(app, { state: 'rejecting', interpretation });

  await mockPlustek.simulateLoadSheet(ballotImages.wrongElection);
  await waitForStatus(app, {
    state: 'both_sides_have_paper',
    error: 'both_sides_have_paper',
    interpretation,
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, {
    state: 'rejecting',
    error: 'both_sides_have_paper',
    interpretation,
  });
  await waitForStatus(app, {
    state: 'rejected',
    error: 'both_sides_have_paper',
    interpretation,
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, { state: 'no_paper' });
});

test('insert second ballot while first ballot is returning', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb);
  await waitForStatus(app, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;

  await post(app, '/scanner/scan');
  await expectStatus(app, { state: 'scanning' });
  await waitForStatus(app, { state: 'needs_review', interpretation });

  await post(app, '/scanner/return');
  await waitForStatus(app, { state: 'returning', interpretation });

  await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb);
  await waitForStatus(app, {
    state: 'both_sides_have_paper',
    error: 'both_sides_have_paper',
    interpretation,
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, {
    state: 'rejecting',
    error: 'both_sides_have_paper',
    interpretation,
  });
  await waitForStatus(app, {
    state: 'rejected',
    error: 'both_sides_have_paper',
    interpretation,
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, { state: 'no_paper' });
});

test('jam on scan', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.completeBmd);
  await waitForStatus(app, { state: 'ready_to_scan' });

  mockPlustek.simulateJamOnNextOperation();
  await post(app, '/scanner/scan');
  await waitForStatus(app, { state: 'jammed', error: 'plustek_error' });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, { state: 'no_paper' });
});

test('jam on accept', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.completeBmd);
  await waitForStatus(app, { state: 'ready_to_scan' });

  const interpretation: Scan.InterpretationResult = {
    type: 'INTERPRETATION_VALID',
  };

  await post(app, '/scanner/scan');
  await waitForStatus(app, { state: 'scanning' });
  await waitForStatus(app, { state: 'ready_to_accept', interpretation });

  mockPlustek.simulateJamOnNextOperation();
  await post(app, '/scanner/accept');
  // The paper can't get permanently jammed on accept - it just stays held in
  // the back and we can reject at that point
  // TODO canUnconfigure should be true, but this will be fixed when we stop
  // optimistically counting ballots
  await expectStatus(app, {
    state: 'rejecting',
    interpretation,
    error: 'paper_in_back_after_accept',
    canUnconfigure: false,
  });
  await waitForStatus(app, {
    state: 'rejected',
    error: 'paper_in_back_after_accept',
    interpretation,
    canUnconfigure: false,
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, { state: 'no_paper', canUnconfigure: false });
});

test('jam on return', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb);
  await waitForStatus(app, { state: 'ready_to_scan' });

  const interpretation = needsReviewInterpretation;

  await post(app, '/scanner/scan');
  await expectStatus(app, { state: 'scanning' });
  await waitForStatus(app, { state: 'needs_review', interpretation });

  mockPlustek.simulateJamOnNextOperation();
  await post(app, '/scanner/return');
  await waitForStatus(app, {
    state: 'jammed',
    interpretation,
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, { state: 'no_paper' });
});

test('jam on reject', async () => {
  const { app, mockPlustek } = await createApp();
  await configureApp(app);

  await mockPlustek.simulateLoadSheet(ballotImages.wrongElection);
  await waitForStatus(app, { state: 'ready_to_scan' });

  await post(app, '/scanner/scan');
  await expectStatus(app, { state: 'scanning' });
  mockPlustek.simulateJamOnNextOperation();
  await waitForStatus(app, {
    state: 'jammed',
    error: 'plustek_error',
  });

  await mockPlustek.simulateRemoveSheet();
  await waitForStatus(app, { state: 'no_paper' });
});
