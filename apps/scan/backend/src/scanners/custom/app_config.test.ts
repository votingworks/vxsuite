import { assert, iter, ok } from '@votingworks/basics';
import { CustomScanner, mocks } from '@votingworks/custom-scanner';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import { LogEventId } from '@votingworks/logging';
import { generateCvr } from '@votingworks/test-utils';
import { SCANNER_RESULTS_FOLDER } from '@votingworks/utils';
import fs from 'fs';
import { join } from 'path';
import waitForExpect from 'wait-for-expect';
import { configureApp, waitForStatus } from '../../../test/helpers/app_helpers';
import {
  ballotImages,
  withSimpleCustomScannerApp,
} from '../../../test/helpers/scanners/custom/app_helpers';
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
  mockScanner: jest.Mocked<CustomScanner>,
  apiClient: grout.Client<Api>,
  initialBallotsCounted: number
) {
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, {
    state: 'ready_to_scan',
    ballotsCounted: initialBallotsCounted,
  });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };

  mockScanner.scan.mockResolvedValueOnce(ok(await ballotImages.completeBmd()));
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await waitForStatus(apiClient, {
    state: 'ready_to_accept',
    interpretation,
    ballotsCounted: initialBallotsCounted,
  });
  await apiClient.acceptBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
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

test('export the CVRs to USB', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, workspace, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb);
      await scanBallot(mockScanner, apiClient, 0);
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
    }
  );
});

test('ballot batching', async () => {
  await withSimpleCustomScannerApp(
    {},
    async ({ apiClient, logger, workspace, mockScanner, mockUsb }) => {
      await configureApp(apiClient, mockUsb);

      // Scan two ballots, which should have the same batch
      await scanBallot(mockScanner, apiClient, 0);
      await scanBallot(mockScanner, apiClient, 1);
      let cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(2);
      const firstBatchIds = iter(cvrs)
        .map((cvr) => cvr._batchId)
        .toSet();
      expect(firstBatchIds).toMatchObject({ size: 1 });
      const batch1Id = iter(firstBatchIds).first() as string;

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
      await scanBallot(mockScanner, apiClient, 2);
      await scanBallot(mockScanner, apiClient, 3);
      cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(4);
      const secondBatchIds = iter(cvrs)
        .map((cvr) => cvr._batchId)
        .filter((id) => id !== batch1Id)
        .toSet();
      expect(secondBatchIds).toMatchObject({ size: 1 });
      const batch2Id = iter(secondBatchIds).first() as string;

      // Replace the ballot bag, which should create a new batch
      await apiClient.recordBallotBagReplaced();
      expect(workspace.store.getBallotCountWhenBallotBagLastReplaced()).toEqual(
        4
      );
      await waitForExpect(() => {
        expect(logger.log).toHaveBeenCalledWith(
          LogEventId.ScannerBatchEnded,
          'system',
          expect.objectContaining({
            disposition: 'success',
            message:
              'Current scanning batch ended due to ballot bag replacement.',
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
            message:
              'New scanning batch started due to ballot bag replacement.',
            batchId: expect.not.stringMatching(batch2Id),
          })
        );
      });

      // Confirm there is a third batch, distinct from the second
      await scanBallot(mockScanner, apiClient, 4);
      await scanBallot(mockScanner, apiClient, 5);
      cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(6);
      const thirdBatchIds = iter(cvrs)
        .map((cvr) => cvr._batchId)
        .filter((id) => id !== batch1Id && id !== batch2Id)
        .toSet();
      expect(thirdBatchIds).toMatchObject({ size: 1 });
    }
  );
});
