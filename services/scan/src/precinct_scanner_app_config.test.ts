import { MockScannerClient } from '@votingworks/plustek-sdk';
import request from 'supertest';
import { Application } from 'express';
import { electionMinimalExhaustiveSampleSinglePrecinctDefinition } from '@votingworks/fixtures';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { Scan } from '@votingworks/api';
import waitForExpect from 'wait-for-expect';
import { LogEventId } from '@votingworks/logging';
import {
  ballotImages,
  configureApp,
  createApp,
  get,
  patch,
  post,
  postExportCvrs,
  setAppPrecinct,
  setPollsState,
  waitForStatus,
} from '../test/helpers/precinct_scanner_app';

jest.setTimeout(20_000);

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
  const response = await get(app, '/precinct-scanner/config');
  expect(response.body.precinctSelection).toMatchObject({
    kind: 'SinglePrecinct',
    precinctId: 'precinct-1',
  });
});

describe('POST /precinct-scanner/export', () => {
  test('sets CVRs as backed up', async () => {
    const { app, workspace } = await createApp();

    await configureApp(app);
    await request(app)
      .post('/precinct-scanner/export')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send({ skipImages: true })
      .expect(200);

    expect(workspace.store.getCvrsBackupTimestamp()).toBeDefined();
  });
});

describe('PATCH /precinct-scanner/config/precinct', () => {
  test('will return error status if ballots have been cast', async () => {
    const { app, mockPlustek } = await createApp();
    await configureApp(app);
    await scanBallot(mockPlustek, app, 0);

    await request(app)
      .patch('/precinct-scanner/config/precinct')
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
  const { app, mockPlustek, logger } = await createApp();
  await configureApp(app);

  // Scan two ballots, which should have the same batch
  await scanBallot(mockPlustek, app, 0);
  await scanBallot(mockPlustek, app, 1);
  let cvrs = await postExportCvrs(app);
  expect(cvrs.length).toBe(2);
  const batch1Id = cvrs[0]._batchId;
  expect(cvrs[1]._batchId).toEqual(batch1Id);

  // Pause polls, which should stop the current batch
  await setPollsState(app, 'polls_paused');
  await waitForExpect(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PrecinctScannerBatchEnded,
      'system',
      expect.objectContaining({
        disposition: 'success',
        message:
          'Current scanning batch ended due to polls being closed or paused.',
        batchId: batch1Id,
      })
    );
  });

  // Reopen polls, which should stop the current batch
  await setPollsState(app, 'polls_open');
  await waitForExpect(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PrecinctScannerBatchStarted,
      'system',
      expect.objectContaining({
        disposition: 'success',
        message:
          'New scanning batch started due to polls being opened or reopened.',
        batchId: expect.not.stringMatching(batch1Id),
      })
    );
  });

  // Confirm there is a new, second batch distinct from the first
  await scanBallot(mockPlustek, app, 2);
  await scanBallot(mockPlustek, app, 3);
  cvrs = await postExportCvrs(app);
  expect(cvrs.length).toBe(4);
  const batch2Id = cvrs[2]._batchId;
  expect(batch2Id).not.toEqual(batch1Id);
  expect(cvrs[3]._batchId).toEqual(batch2Id);

  // Change the ballot box, which should create a new batch
  await patch(
    app,
    '/precinct-scanner/config/ballotCountWhenBallotBagLastReplaced',
    {
      ballotCountWhenBallotBagLastReplaced: 1500,
    }
  );
  await waitForExpect(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PrecinctScannerBatchEnded,
      'system',
      expect.objectContaining({
        disposition: 'success',
        message: 'Current scanning batch ended due to ballot bag replacement.',
        batchId: batch2Id,
      })
    );
  });
  await waitForExpect(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.PrecinctScannerBatchStarted,
      'system',
      expect.objectContaining({
        disposition: 'success',
        message: 'New scanning batch started due to ballot bag replacement.',
        batchId: expect.not.stringMatching(batch2Id),
      })
    );
  });

  // Confirm there is a third batch, distinct from the second
  await scanBallot(mockPlustek, app, 4);
  await scanBallot(mockPlustek, app, 5);
  cvrs = await postExportCvrs(app);
  expect(cvrs.length).toBe(6);
  const batch3Id = cvrs[4]._batchId;
  expect(cvrs[3]._batchId).not.toEqual(batch3Id);
  expect(cvrs[5]._batchId).toEqual(batch3Id);
});
