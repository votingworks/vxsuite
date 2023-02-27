import { assert, ok } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import { LogEventId } from '@votingworks/logging';
import { MockScannerClient } from '@votingworks/plustek-scanner';
import { generateCvr } from '@votingworks/test-utils';
import { SCANNER_RESULTS_FOLDER } from '@votingworks/utils';
import fs from 'fs';
import { join } from 'path';
import waitForExpect from 'wait-for-expect';
import { configureApp, waitForStatus } from '../../../test/helpers/app_helpers';
import {
  ballotImages,
  createPlustekScannerApp,
} from '../../../test/helpers/scanners/plustek/app_helpers';
import { Api } from '../../app';
import { SheetInterpretation } from '../../types';

jest.setTimeout(20_000);
jest.mock('@votingworks/ballot-encoder', () => {
  return {
    ...jest.requireActual('@votingworks/ballot-encoder'),
    // to allow changing election definitions without changing the image fixtures
    // TODO: generate image fixtures from election definitions more easily
    sliceElectionHash: () => 'da81438d51136692b43c',
  };
});

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

  const interpretation: SheetInterpretation = {
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

test('export CVRs to USB in deprecated VotingWorks format', async () => {
  const {
    apiClient,
    workspace,
    mockScanner: mockPlustek,
    mockUsb,
  } = await createPlustekScannerApp();
  await configureApp(apiClient, mockUsb);
  await scanBallot(mockPlustek, apiClient, 0);
  expect(await apiClient.exportCastVoteRecordsToUsbDrive()).toEqual(ok());

  const [usbDrive] = await mockUsb.mock.getUsbDrives();
  assert(usbDrive.mountPoint !== undefined);
  const resultsDirPath = join(usbDrive.mountPoint, SCANNER_RESULTS_FOLDER);
  const electionDirs = fs.readdirSync(resultsDirPath);
  expect(electionDirs).toHaveLength(1);
  const electionDirPath = join(resultsDirPath, electionDirs[0]);
  const cvrFiles = fs.readdirSync(electionDirPath);
  expect(cvrFiles).toHaveLength(1);
  expect(cvrFiles[0]).toMatch(/machine_0000__1_ballots__.*.jsonl/);
  const cvrFilePath = join(electionDirPath, cvrFiles[0]);
  const cvr = JSON.parse(fs.readFileSync(cvrFilePath).toString());
  const expectedCvr = generateCvr(
    electionFamousNames2021Fixtures.election,
    {
      attorney: ['john-snow'],
      'board-of-alderman': [
        'helen-keller',
        'steve-jobs',
        'nikola-tesla',
        'vincent-van-gogh',
      ],
      'chief-of-police': ['natalie-portman'],
      'city-council': [
        'marie-curie',
        'indiana-jones',
        'mona-lisa',
        'jackie-chan',
      ],
      controller: ['winston-churchill'],
      mayor: ['sherlock-holmes'],
      'parks-and-recreation-director': ['charles-darwin'],
      'public-works-director': ['benjamin-franklin'],
    },
    {
      scannerId: '000',
    }
  );

  expect(cvr).toEqual({
    ...expectedCvr,
    _ballotId: expect.any(String),
    _batchId: expect.any(String),
  });

  expect(workspace.store.getCvrsBackupTimestamp()).toBeDefined();
});

test('ballot batching', async () => {
  const {
    apiClient,
    mockScanner: mockPlustek,
    logger,
    workspace,
    mockUsb,
  } = await createPlustekScannerApp();
  await configureApp(apiClient, mockUsb);

  // Scan two ballots, which should have the same batch
  await scanBallot(mockPlustek, apiClient, 0);
  await scanBallot(mockPlustek, apiClient, 1);
  let cvrs = await apiClient.getCastVoteRecordsForTally();
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
  cvrs = await apiClient.getCastVoteRecordsForTally();
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
  cvrs = await apiClient.getCastVoteRecordsForTally();
  expect(cvrs).toHaveLength(6);
  const batch3Id = cvrs[4]._batchId;
  expect(cvrs[3]._batchId).not.toEqual(batch3Id);
  expect(cvrs[5]._batchId).toEqual(batch3Id);
});

test('unconfiguring machine', async () => {
  const { apiClient, mockUsb, interpreter, workspace } = await createApp();
  await configureApp(apiClient, mockUsb);

  jest.spyOn(interpreter, 'unconfigure');
  jest.spyOn(workspace, 'reset');

  await apiClient.unconfigureElection({});

  expect(interpreter.unconfigure).toHaveBeenCalledTimes(1);
  expect(workspace.reset).toHaveBeenCalledTimes(1);
});

test('auth', async () => {
  const { electionHash } = electionFamousNames2021Fixtures.electionDefinition;
  const { apiClient, mockAuth, mockUsb } = await createApp();
  await configureApp(apiClient, mockUsb);

  await apiClient.getAuthStatus();
  await apiClient.checkPin({ pin: '123456' });

  expect(mockAuth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(mockAuth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    electionHash,
  });
  expect(mockAuth.checkPin).toHaveBeenCalledTimes(1);
  expect(mockAuth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { pin: '123456' }
  );
});
