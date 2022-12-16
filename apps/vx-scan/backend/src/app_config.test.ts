import { MockScannerClient } from '@votingworks/plustek-sdk';
import request from 'supertest';
import { electionMinimalExhaustiveSampleSinglePrecinctDefinition } from '@votingworks/fixtures';
import { Scan } from '@votingworks/api';
import waitForExpect from 'wait-for-expect';
import { LogEventId } from '@votingworks/logging';
import * as grout from '@votingworks/grout';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import {
  ballotImages,
  configureApp,
  createApp,
  postExportCvrs,
  waitForStatus,
} from '../test/helpers/app_helpers';
import { Api } from './app';

jest.setTimeout(20_000);

async function scanBallot(
  mockPlustek: MockScannerClient,
  apiClient: grout.Client<Api>,
  initialBallotsCounted: number
) {
  (
    await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
  ).unsafeUnwrap();
  await waitForStatus(apiClient, {
    state: 'ready_to_scan',
    ballotsCounted: initialBallotsCounted,
  });

  const interpretation: Scan.SheetInterpretation = {
    type: 'ValidSheet',
  };

  await apiClient.scanBallot();
  await waitForStatus(apiClient, {
    state: 'ready_to_accept',
    interpretation,
    ballotsCounted: initialBallotsCounted,
  });
  await apiClient.acceptBallot();
  await waitForStatus(apiClient, {
    ballotsCounted: initialBallotsCounted + 1,
    state: 'accepted',
    interpretation,
  });

  // Wait for transition back to no paper
  await waitForStatus(apiClient, {
    state: 'no_paper',
    ballotsCounted: initialBallotsCounted + 1,
  });
}

test("setting the election also sets precinct if there's only one", async () => {
  const { apiClient } = await createApp();
  await apiClient.setElection({
    electionData:
      electionMinimalExhaustiveSampleSinglePrecinctDefinition.electionData,
  });
  const config = await apiClient.getConfig();
  expect(config.precinctSelection).toMatchObject({
    kind: 'SinglePrecinct',
    precinctId: 'precinct-1',
  });
});

describe('POST /precinct-scanner/export', () => {
  test('sets CVRs as backed up', async () => {
    const { apiClient, app, workspace } = await createApp();

    await configureApp(apiClient, app);
    await request(app)
      .post('/precinct-scanner/export')
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send({ skipImages: true })
      .expect(200);

    expect(workspace.store.getCvrsBackupTimestamp()).toBeDefined();
  });
});

test('setPrecinctSelection will reset polls to closed', async () => {
  const { apiClient, app, workspace } = await createApp();
  await configureApp(apiClient, app);

  workspace.store.setPollsState('polls_open');
  await apiClient.setPrecinctSelection({
    precinctSelection: singlePrecinctSelectionFor('21'),
  });
  expect(workspace.store.getPollsState()).toEqual('polls_closed_initial');
});

test('ballot batching', async () => {
  const { apiClient, app, mockPlustek, logger, workspace } = await createApp();
  await configureApp(apiClient, app);

  // Scan two ballots, which should have the same batch
  await scanBallot(mockPlustek, apiClient, 0);
  await scanBallot(mockPlustek, apiClient, 1);
  let cvrs = await postExportCvrs(app);
  expect(cvrs).toHaveLength(2);
  const batch1Id = cvrs[0]._batchId;
  expect(cvrs[1]._batchId).toEqual(batch1Id);

  // Pause polls, which should stop the current batch
  await apiClient.setPollsState({ pollsState: 'polls_paused' });
  await waitForExpect(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ScannerBatchEnded,
      'system',
      expect.objectContaining({
        disposition: 'success',
        message:
          'Current scanning batch ended due to polls being closed or voting being paused.',
        batchId: batch1Id,
      })
    );
  });

  // Reopen polls, which should stop the current batch
  await apiClient.setPollsState({ pollsState: 'polls_open' });
  await waitForExpect(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ScannerBatchStarted,
      'system',
      expect.objectContaining({
        disposition: 'success',
        message:
          'New scanning batch started due to polls being opened or voting being resumed.',
        batchId: expect.not.stringMatching(batch1Id),
      })
    );
  });

  // Confirm there is a new, second batch distinct from the first
  await scanBallot(mockPlustek, apiClient, 2);
  await scanBallot(mockPlustek, apiClient, 3);
  cvrs = await postExportCvrs(app);
  expect(cvrs).toHaveLength(4);
  const batch2Id = cvrs[2]._batchId;
  expect(batch2Id).not.toEqual(batch1Id);
  expect(cvrs[3]._batchId).toEqual(batch2Id);

  // Replace the ballot bag, which should create a new batch
  await apiClient.recordBallotBagReplaced();
  expect(workspace.store.getBallotCountWhenBallotBagLastReplaced()).toEqual(4);
  await waitForExpect(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ScannerBatchEnded,
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
      LogEventId.ScannerBatchStarted,
      'system',
      expect.objectContaining({
        disposition: 'success',
        message: 'New scanning batch started due to ballot bag replacement.',
        batchId: expect.not.stringMatching(batch2Id),
      })
    );
  });

  // Confirm there is a third batch, distinct from the second
  await scanBallot(mockPlustek, apiClient, 4);
  await scanBallot(mockPlustek, apiClient, 5);
  cvrs = await postExportCvrs(app);
  expect(cvrs).toHaveLength(6);
  const batch3Id = cvrs[4]._batchId;
  expect(cvrs[3]._batchId).not.toEqual(batch3Id);
  expect(cvrs[5]._batchId).toEqual(batch3Id);
});
