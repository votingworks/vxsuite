import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  DEFAULT_SYSTEM_SETTINGS,
  SheetInterpretation,
} from '@votingworks/types';
import waitForExpect from 'wait-for-expect';
import { err, ok, sleep, typedAs } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireAmherstFixtures,
} from '@votingworks/fixtures';
import { Logger } from '@votingworks/logging';
import { ErrorCode, mocks } from '@votingworks/custom-scanner';
import {
  BooleanEnvironmentVariableName,
  getEmptyElectionResults,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { MAX_FAILED_SCAN_ATTEMPTS } from './state_machine';
import {
  configureApp,
  expectStatus,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import {
  ballotImages,
  simulateScan,
  withApp,
} from '../../../test/helpers/custom_helpers';

jest.setTimeout(20_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
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
    async ({ apiClient, mockScanner, mockUsbDrive, logger, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireAmherstFixtures.electionJson.toElectionPackage(),
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      simulateScan(mockScanner, await ballotImages.completeHmpb());
      await apiClient.scanBallot();
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

      // Check the ballot appears in the results
      const results = await apiClient.getScannerResultsByParty();
      expect(results).toHaveLength(1);
      expect(results[0].cardCounts).toEqual({
        bmd: 0,
        hmpb: [1],
      });

      checkLogs(logger);
    }
  );
});

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('configure and scan bmd ballot', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, logger, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      simulateScan(mockScanner, await ballotImages.completeBmd());
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
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });

      // Test scanning again without first transitioning back to no_paper
      await waitForStatus(apiClient, {
        state: 'ready_to_scan',
        ballotsCounted: 1,
      });

      // Check the ballot appears in the results
      const results = await apiClient.getScannerResultsByParty();
      expect(results).toHaveLength(1);
      expect(results[0].cardCounts).toEqual({
        bmd: 1,
        hmpb: [],
      });

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
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireAmherstFixtures.electionJson.toElectionPackage(
            {
              ...DEFAULT_SYSTEM_SETTINGS,
              precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
            }
          ),
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

      simulateScan(mockScanner, await ballotImages.overvoteHmpb());
      await apiClient.scanBallot();
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

      // Check the results
      const results = await apiClient.getScannerResultsByParty();
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(
        getEmptyElectionResults(
          electionGridLayoutNewHampshireAmherstFixtures.election
        )
      );

      // Make sure the ballot was still recorded in the db for backup purposes
      expect(Array.from(workspace.store.forEachSheet())).toHaveLength(1);

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
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_election_hash',
      };

      simulateScan(mockScanner, await ballotImages.wrongElection());
      await apiClient.scanBallot();
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

      // Check the results
      const results = await apiClient.getScannerResultsByParty();
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(
        getEmptyElectionResults(electionFamousNames2021Fixtures.election)
      );

      // Make sure the ballot was still recorded in the db for backup purposes
      expect(Array.from(workspace.store.forEachSheet())).toHaveLength(1);

      checkLogs(logger);
    }
  );
});

test('blank sheet ballot rejected', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'unknown',
      };

      simulateScan(mockScanner, await ballotImages.blankSheet());
      await apiClient.scanBallot();
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

test('scan fail immediately gives up', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      mockScanner.scan.mockResolvedValue(err(ErrorCode.NoDocumentToBeScanned));
      await apiClient.scanBallot();
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'scanning_failed',
      });
    }
  );
});

test('unexpected interpretation error retries and eventually fails', async () => {
  let didInterpret = false;
  const interpret = jest.fn().mockImplementation(() => {
    didInterpret = true;
    throw new Error('unexpected dims');
  });

  await withApp(
    {
      interpret,
    },
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      let didScan = false;
      mockScanner.getStatus.mockImplementation(() => {
        if (!didScan || didInterpret) {
          return Promise.resolve(ok(mocks.MOCK_READY_TO_SCAN));
        }
        return Promise.resolve(ok(mocks.MOCK_READY_TO_EJECT));
      });
      mockScanner.scan.mockImplementation(async () => {
        didScan = true;
        return Promise.resolve(ok(await ballotImages.blankSheet()));
      });
      await apiClient.scanBallot();
      for (let i = 0; i < MAX_FAILED_SCAN_ATTEMPTS; i += 1) {
        await waitForExpect(() => {
          expect(interpret).toHaveBeenCalledTimes(i + 1);
        });
        await waitForExpect(async () => {
          await expectStatus(apiClient, { state: 'ready_to_scan' });
        });
        didScan = false;
        didInterpret = false;
        await apiClient.scanBallot();
        await waitForExpect(async () => {
          await expectStatus(apiClient, { state: 'scanning' });
        });
      }
      await waitForExpect(() => {
        expect(interpret).toHaveBeenCalledTimes(MAX_FAILED_SCAN_ATTEMPTS + 1);
      });
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'client_error',
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
      await configureApp(apiClient, mockAuth, mockUsbDrive);

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
