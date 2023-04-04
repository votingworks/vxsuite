import { AdjudicationReason } from '@votingworks/types';
import waitForExpect from 'wait-for-expect';
import { err, ok, Result } from '@votingworks/basics';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  ReportSourceMachineType,
  ScannerReportData,
  ScannerReportDataSchema,
} from '@votingworks/utils';
import { Logger } from '@votingworks/logging';
import { MAX_FAILED_SCAN_ATTEMPTS } from './state_machine';
import {
  configureApp,
  expectStatus,
  mockInterpretation,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { SheetInterpretation } from '../../types';
import { ballotImages, withApp } from '../../../test/helpers/plustek_helpers';

jest.setTimeout(20_000);
jest.mock('@votingworks/ballot-encoder', () => {
  return {
    ...jest.requireActual('@votingworks/ballot-encoder'),
    // to allow changing election definitions without changing the image fixtures
    // TODO: generate image fixtures from election definitions more easily
    // this election hash is for the famous names image fixtures
    sliceElectionHash: () => 'da81438d51136692b43c',
  };
});

/**
 * Basic checks for logging. We don't try to be exhaustive here because paper
 * status polling can be a bit non-deterministic, so logs can vary between runs.
 */
function checkLogs(logger: Logger): void {
  // Make sure we got a transition
  expect(logger.log).toHaveBeenCalledWith(
    'scanner-state-machine-transition',
    'system',
    { message: 'Transitioned to: "checking_initial_paper_status"' },
    expect.any(Function)
  );
  // Make sure we got an event
  expect(logger.log).toHaveBeenCalledWith(
    'scanner-state-machine-event',
    'system',
    { message: 'Event: SCANNER_NO_PAPER' },
    expect.any(Function)
  );
  // Make sure we got a context update. And make sure we didn't log the votes in
  // the interpretation, just the type, to protect voter privacy.
  expect(logger.log).toHaveBeenCalledWith(
    'scanner-state-machine-transition',
    'system',
    {
      message: 'Context updated',
      changedFields: expect.stringMatching(
        /{"interpretation":"(ValidSheet|InvalidSheet|NeedsReviewSheet)"}/
      ),
    },
    expect.any(Function)
  );
}

test('configure and scan hmpb', async () => {
  await withApp(
    {},
    async ({ apiClient, mockPlustek, mockUsb, logger, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { addTemplates: true, mockAuth });

      (
        await mockPlustek.simulateLoadSheet(ballotImages.completeHmpb)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });

      // Test waiting for automatic transition back to no_paper
      await waitForStatus(apiClient, { state: 'no_paper', ballotsCounted: 1 });

      // Check the CVR
      const cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(1);
      // TODO what do we actually want to check about the CVRs to make sure they work?

      checkLogs(logger);
    }
  );
});

test('configure and scan bmd ballot', async () => {
  await withApp(
    {},
    async ({ apiClient, mockPlustek, mockUsb, logger, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

      (
        await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });

      // Test scanning again without first transitioning back to no_paper
      (
        await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, {
        state: 'ready_to_scan',
        ballotsCounted: 1,
      });

      // Check the CVR
      const cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(1);

      checkLogs(logger);
    }
  );
});

const needsReviewInterpretation: SheetInterpretation = {
  type: 'NeedsReviewSheet',
  reasons: [{ type: AdjudicationReason.BlankBallot }],
};

test('ballot needs review - return', async () => {
  await withApp(
    {},
    async ({
      apiClient,
      mockPlustek,
      workspace,
      mockUsb,
      logger,
      mockAuth,
    }) => {
      await configureApp(apiClient, mockUsb, { addTemplates: true, mockAuth });

      (
        await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation = needsReviewInterpretation;

      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.returnBallot();
      await expectStatus(apiClient, {
        state: 'returning',
        interpretation,
      });
      await waitForStatus(apiClient, {
        state: 'returned',
        interpretation,
      });

      (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
      await waitForStatus(apiClient, {
        state: 'no_paper',
      });

      // Check the CVR
      const cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(0);

      // Make sure the ballot was still recorded in the db for backup purposes
      expect(Array.from(workspace.store.getSheets())).toHaveLength(1);

      checkLogs(logger);
    }
  );
});

test('ballot needs review - accept', async () => {
  await withApp(
    {},
    async ({ apiClient, mockPlustek, mockUsb, logger, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { addTemplates: true, mockAuth });

      (
        await mockPlustek.simulateLoadSheet(ballotImages.unmarkedHmpb)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation = needsReviewInterpretation;

      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting_after_review',
        interpretation,
      });
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });

      await waitForStatus(apiClient, {
        state: 'no_paper',
        ballotsCounted: 1,
      });

      // Check the CVR
      const cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(1);

      checkLogs(logger);
    }
  );
});

// TODO test all the invalid ballot reasons?
test('invalid ballot rejected', async () => {
  await withApp(
    {},
    async ({
      apiClient,
      mockPlustek,
      workspace,
      mockUsb,
      logger,
      mockAuth,
    }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

      (
        await mockPlustek.simulateLoadSheet(ballotImages.wrongElection)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_election_hash',
      };

      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });
      await waitForStatus(apiClient, {
        state: 'rejected',
        interpretation,
      });

      (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'no_paper' });

      // Check the CVR
      const cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(0);

      // Make sure the ballot was still recorded in the db for backup purposes
      expect(Array.from(workspace.store.getSheets())).toHaveLength(1);

      checkLogs(logger);
    }
  );
});

test('blank sheet ballot rejected', async () => {
  await withApp({}, async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    (
      await mockPlustek.simulateLoadSheet(ballotImages.blankSheet)
    ).unsafeUnwrap();
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    const interpretation: SheetInterpretation = {
      type: 'InvalidSheet',
      reason: 'unknown',
    };

    await apiClient.scanBallot();
    await expectStatus(apiClient, { state: 'scanning' });
    await waitForStatus(apiClient, {
      state: 'rejecting',
      interpretation,
    });
    await waitForStatus(apiClient, {
      state: 'rejected',
      interpretation,
    });

    (await mockPlustek.simulateRemoveSheet()).unsafeUnwrap();
    await waitForStatus(apiClient, { state: 'no_paper' });
  });
});

test('scan fails and retries', async () => {
  await withApp(
    {},
    async ({
      apiClient,
      interpreter,
      logger,
      mockPlustek,
      mockUsb,
      mockAuth,
    }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

      (
        await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };
      mockInterpretation(interpreter, interpretation);

      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockPlustek.simulateScanError('error_feeding');
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      // Make sure the underlying error got logged correctly
      expect(logger.log).toHaveBeenCalledWith(
        'scanner-state-machine-transition',
        'system',
        {
          message: 'Context updated',
          changedFields: expect.stringMatching(
            /{"error":"(PLKSS_ERRCODE_PAPER_STATUS_ERROR_FEEDING|PLKSS_ERRCODE_PAPER_STATUS_NO_PAPER)","failedScanAttempts":1}/
          ),
        },
        expect.any(Function)
      );
    }
  );
});

test('scan fails repeatedly and eventually gives up', async () => {
  await withApp({}, async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    (
      await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
    ).unsafeUnwrap();
    await waitForStatus(apiClient, { state: 'ready_to_scan' });

    const scanSpy = jest.spyOn(mockPlustek, 'scan');
    await apiClient.scanBallot();
    for (let i = 0; i < MAX_FAILED_SCAN_ATTEMPTS; i += 1) {
      await waitForExpect(() => {
        expect(scanSpy).toHaveBeenCalledTimes(i + 1);
      });
      await expectStatus(apiClient, { state: 'scanning' });
      mockPlustek.simulateScanError('error_feeding');
    }
    await waitForStatus(apiClient, {
      state: 'rejected',
      error: 'scanning_failed',
    });
  });
});

test('scan fails due to plustek returning only one file instead of two', async () => {
  await withApp(
    {},
    async ({ apiClient, mockPlustek, mockUsb, logger, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

      (
        await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockPlustek.simulateScanError('only_one_file_returned');
      await waitForStatus(apiClient, {
        state: 'unrecoverable_error',
        error: 'client_error',
      });

      // Make sure the underlying error got logged correctly
      expect(logger.log).toHaveBeenCalledWith(
        'scanner-state-machine-transition',
        'system',
        {
          message: 'Context updated',
          changedFields: expect.stringMatching(
            /{"error":{"message":"expected two files, got \[ file1.jpg \]","stack":".*"}}/
          ),
        },
        expect.any(Function)
      );
    }
  );
});

test('scanning time out', async () => {
  await withApp(
    {
      delays: {
        DELAY_SCANNING_TIMEOUT: 50,
        DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 500,
      },
    },
    async ({ apiClient, mockPlustek, logger, mockUsb, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

      (
        await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'recovering_from_error',
        error: 'scanning_timed_out',
      });
      await waitForStatus(apiClient, { state: 'no_paper' });

      // Make sure the underlying error got logged correctly
      expect(logger.log).toHaveBeenCalledWith(
        'scanner-state-machine-transition',
        'system',
        {
          message: 'Context updated',
          changedFields: expect.stringMatching(
            /{"error":{"type":"scanning_timed_out","message":"scanning_timed_out","stack":".*"}}/
          ),
        },
        expect.any(Function)
      );
    }
  );
});

test('kills plustekctl if it freezes', async () => {
  await withApp(
    {
      delays: {
        DELAY_SCANNING_TIMEOUT: 50,
        DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 500,
        DELAY_KILL_AFTER_DISCONNECT_TIMEOUT: 500,
        DELAY_PAPER_STATUS_POLLING_TIMEOUT: 1000,
      },
    },
    async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

      await waitForStatus(apiClient, { state: 'no_paper' });
      (
        await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockPlustek.simulatePlustekctlFreeze();
      await waitForStatus(apiClient, {
        state: 'recovering_from_error',
        error: 'paper_status_timed_out',
      });
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('stops completely if plustekctl freezes and cant be killed', async () => {
  await withApp(
    {
      delays: {
        DELAY_SCANNING_TIMEOUT: 50,
        DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 500,
        DELAY_KILL_AFTER_DISCONNECT_TIMEOUT: 500,
        DELAY_PAPER_STATUS_POLLING_TIMEOUT: 1000,
      },
    },
    async ({ apiClient, mockPlustek, mockUsb, mockAuth }) => {
      await configureApp(apiClient, mockUsb, { mockAuth });

      await waitForStatus(apiClient, { state: 'no_paper' });
      (
        await mockPlustek.simulateLoadSheet(ballotImages.completeBmd)
      ).unsafeUnwrap();
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      jest
        .spyOn(mockPlustek, 'kill')
        .mockReturnValue(err(new Error('could not kill')));
      mockPlustek.simulatePlustekctlFreeze();
      await waitForStatus(apiClient, {
        state: 'recovering_from_error',
        error: 'paper_status_timed_out',
      });
      await waitForStatus(apiClient, {
        state: 'unrecoverable_error',
        error: 'paper_status_timed_out',
      });
    }
  );
});

test('write scanner report data to card', async () => {
  await withApp({}, async ({ apiClient, mockAuth, mockUsb }) => {
    await configureApp(apiClient, mockUsb, { mockAuth });

    mockOf(mockAuth.writeCardData).mockImplementation(() =>
      Promise.resolve(ok())
    );

    const { electionDefinition } = electionFamousNames2021Fixtures;
    const { electionHash } = electionDefinition;
    const scannerReportData: ScannerReportData = {
      ballotCounts: {},
      isLiveMode: false,
      machineId: '0000',
      pollsTransition: 'close_polls',
      precinctSelection: ALL_PRECINCTS_SELECTION,
      tally: [],
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      timePollsTransitioned: 0,
      timeSaved: 0,
      totalBallotsScanned: 0,
    };
    let result: Result<void, Error>;

    mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
      Promise.resolve({ status: 'logged_out', reason: 'no_card' })
    );
    result = await apiClient.saveScannerReportDataToCard({ scannerReportData });
    expect(result).toEqual(err(new Error('User is not logged in')));

    mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
      Promise.resolve({
        status: 'logged_in',
        user: fakeElectionManagerUser(electionDefinition),
        sessionExpiresAt: fakeSessionExpiresAt(),
      })
    );
    result = await apiClient.saveScannerReportDataToCard({ scannerReportData });
    expect(result).toEqual(err(new Error('User is not a poll worker')));

    mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
      Promise.resolve({
        status: 'logged_in',
        user: fakePollWorkerUser(electionDefinition),
        sessionExpiresAt: fakeSessionExpiresAt(),
      })
    );
    result = await apiClient.saveScannerReportDataToCard({ scannerReportData });
    expect(result).toEqual(ok());
    expect(mockAuth.writeCardData).toHaveBeenCalledTimes(1);
    expect(mockAuth.writeCardData).toHaveBeenNthCalledWith(
      1,
      { electionHash },
      { data: scannerReportData, schema: ScannerReportDataSchema }
    );
  });
});
