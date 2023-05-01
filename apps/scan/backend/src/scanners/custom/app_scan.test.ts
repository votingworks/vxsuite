import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  DEFAULT_SYSTEM_SETTINGS,
  TEST_JURISDICTION,
} from '@votingworks/types';
import waitForExpect from 'wait-for-expect';
import { err, ok, Result, sleep, typedAs } from '@votingworks/basics';
import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireAmherstFixtures,
} from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  ReportSourceMachineType,
  ScannerReportData,
  ScannerReportDataSchema,
} from '@votingworks/utils';
import { Logger } from '@votingworks/logging';
import { ErrorCode, mocks } from '@votingworks/custom-scanner';
import { MAX_FAILED_SCAN_ATTEMPTS } from './state_machine';
import {
  configureApp,
  expectStatus,
  mockInterpretation,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { SheetInterpretation } from '../../types';
import { ballotImages, withApp } from '../../../test/helpers/custom_helpers';

jest.setTimeout(20_000);
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

const jurisdiction = TEST_JURISDICTION;

test('configure and scan hmpb', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, logger, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, {
        mockAuth,
        ballotPackage:
          electionGridLayoutNewHampshireAmherstFixtures.electionJson.toBallotPackage(),
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      mockScanner.scan.mockResolvedValue(ok(await ballotImages.completeHmpb()));
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
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
    async ({ apiClient, mockScanner, mockUsbDrive, logger, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth, testMode: true });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      mockScanner.scan.mockResolvedValue(ok(await ballotImages.completeBmd()));
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
        canUnconfigure: true,
      });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting',
        interpretation,
        canUnconfigure: true,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
        canUnconfigure: true,
      });

      // Test scanning again without first transitioning back to no_paper
      await waitForStatus(apiClient, {
        state: 'ready_to_scan',
        ballotsCounted: 1,
        canUnconfigure: true,
      });

      // Check the CVR
      const cvrs = await apiClient.getCastVoteRecordsForTally();
      expect(cvrs).toHaveLength(1);

      checkLogs(logger);
    }
  );
});

test('ballot needs review - return', async () => {
  await withApp(
    {},
    async ({
      apiClient,
      mockScanner,
      workspace,
      mockUsbDrive,
      logger,
      mockAuth,
    }) => {
      await configureApp(apiClient, mockUsbDrive, {
        mockAuth,
        ballotPackage:
          electionGridLayoutNewHampshireAmherstFixtures.electionJson.toBallotPackage(),
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'NeedsReviewSheet',
        reasons: [
          expect.objectContaining(
            typedAs<Partial<AdjudicationReasonInfo>>({
              type: AdjudicationReason.Overvote,
            })
          ),
        ],
      };

      mockScanner.scan.mockResolvedValue(ok(await ballotImages.overvoteHmpb()));
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.returnBallot();
      await expectStatus(apiClient, {
        state: 'returning',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'returned',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
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

// TODO test all the invalid ballot reasons?
test('invalid ballot rejected', async () => {
  await withApp(
    {},
    async ({
      apiClient,
      mockScanner,
      workspace,
      mockUsbDrive,
      logger,
      mockAuth,
    }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_election_hash',
      };

      mockScanner.scan.mockResolvedValue(
        ok(await ballotImages.wrongElection())
      );
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'rejected',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
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
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'unknown',
      };

      mockScanner.scan.mockResolvedValue(ok(await ballotImages.blankSheet()));
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'rejected',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('scan fails and retries', async () => {
  await withApp(
    {},
    async ({
      apiClient,
      interpreter,
      logger,
      mockScanner,
      mockUsbDrive,
      mockAuth,
    }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };
      mockInterpretation(interpreter, interpretation);

      mockScanner.scan
        .mockResolvedValueOnce(err(ErrorCode.NoDocumentToBeScanned))
        .mockResolvedValueOnce(ok(await ballotImages.completeBmd()));
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus
        .mockResolvedValueOnce(ok(mocks.MOCK_READY_TO_SCAN))
        .mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
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
          changedFields: expect.stringMatching(/{"error":18}/),
        },
        expect.any(Function)
      );
    }
  );
});

test('scan fails repeatedly and eventually gives up', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const scanSpy = jest.spyOn(mockScanner, 'scan');
      mockScanner.scan.mockResolvedValue(err(ErrorCode.NoDocumentToBeScanned));
      await apiClient.scanBallot();
      for (let i = 0; i < MAX_FAILED_SCAN_ATTEMPTS; i += 1) {
        await waitForExpect(() => {
          expect(scanSpy).toHaveBeenCalledTimes(i + 1);
        });
        await expectStatus(apiClient, { state: 'scanning' });
      }
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'scanning_failed',
      });
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
    async ({ apiClient, mockScanner, logger, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockUsbDrive, { mockAuth });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      mockScanner.scan.mockImplementation(async () => {
        await sleep(1000);
        return ok(await ballotImages.completeBmd());
      });
      await apiClient.scanBallot();
      await expectStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'recovering_from_error',
        error: 'scanning_timed_out',
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
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

test('write scanner report data to card', async () => {
  await withApp({}, async ({ apiClient, mockAuth, mockUsbDrive }) => {
    await configureApp(apiClient, mockUsbDrive, { mockAuth });

    mockOf(mockAuth.writeCardData).mockResolvedValue(ok());

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

    mockOf(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_out',
      reason: 'no_card',
    });
    result = await apiClient.saveScannerReportDataToCard({ scannerReportData });
    expect(result).toEqual(err(new Error('User is not logged in')));

    mockOf(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_in',
      user: fakeElectionManagerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    });
    result = await apiClient.saveScannerReportDataToCard({ scannerReportData });
    expect(result).toEqual(err(new Error('User is not a poll worker')));

    mockOf(mockAuth.getAuthStatus).mockResolvedValue({
      status: 'logged_in',
      user: fakePollWorkerUser(electionDefinition),
      sessionExpiresAt: fakeSessionExpiresAt(),
    });
    result = await apiClient.saveScannerReportDataToCard({ scannerReportData });
    expect(result).toEqual(ok());
    expect(mockAuth.writeCardData).toHaveBeenCalledTimes(1);
    expect(mockAuth.writeCardData).toHaveBeenNthCalledWith(
      1,
      { ...DEFAULT_SYSTEM_SETTINGS, electionHash, jurisdiction },
      { data: scannerReportData, schema: ScannerReportDataSchema }
    );
  });
});
