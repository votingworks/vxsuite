import * as fc from 'fast-check';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  DEFAULT_SYSTEM_SETTINGS,
  constructElectionKey,
  SheetInterpretation,
  SheetOf,
} from '@votingworks/types';
import waitForExpect from 'wait-for-expect';
import {
  Result,
  assertDefined,
  deferred,
  err,
  ok,
  sleep,
  typedAs,
} from '@votingworks/basics';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { BaseLogger } from '@votingworks/logging';
import {
  ErrorCode,
  FormMovement,
  ImageFromScanner,
  ScannerStatus,
  mocks,
} from '@votingworks/custom-scanner';
import {
  ALL_PRECINCTS_SELECTION,
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import {
  MAX_FAILED_SCAN_ATTEMPTS,
  ScannerStatusEvent,
  delays,
  scannerStatusToEvent,
} from './state_machine';
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

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

/**
 * Basic checks for logging. We don't try to be exhaustive here because paper
 * status polling can be a bit non-deterministic, so logs can vary between runs.
 */
function checkLogs(logger: BaseLogger): void {
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
        /{"interpretation":"(ValidSheet|InvalidSheet|NeedsReviewSheet)"/
      ),
    },
    expect.any(Function)
  );
}

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_CUSTOM_SCANNER
  );
});

test('configure and scan hmpb', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      logger,
      mockAuth,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      const deferredScan =
        deferred<Result<SheetOf<ImageFromScanner>, ErrorCode>>();
      mockScanner.scan.mockResolvedValueOnce(deferredScan.promise);
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'scanning' });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      deferredScan.resolve(ok(await ballotImages.completeHmpb()));
      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };
      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });

      // Test waiting for automatic transition back to no_paper
      clock.increment(delays.DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT);
      await waitForStatus(apiClient, { state: 'no_paper', ballotsCounted: 1 });

      checkLogs(logger);
    }
  );
});

test('configure and scan bmd ballot', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      logger,
      mockAuth,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      const deferredScan =
        deferred<Result<SheetOf<ImageFromScanner>, ErrorCode>>();
      mockScanner.scan.mockResolvedValueOnce(deferredScan.promise);
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'scanning' });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      deferredScan.resolve(ok(await ballotImages.completeBmd()));
      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };
      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });

      // Test scanning again without first transitioning back to no_paper
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });

      checkLogs(logger);
    }
  );
});

test('ballot needs review - return', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      workspace,
      mockUsbDrive,
      logger,
      mockAuth,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(
            {
              ...DEFAULT_SYSTEM_SETTINGS,
              precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
            }
          ),
      });

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

      const scanDeferred =
        deferred<Result<SheetOf<ImageFromScanner>, ErrorCode>>();
      mockScanner.scan.mockResolvedValueOnce(scanDeferred.promise);
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, { state: 'scanning' });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
      scanDeferred.resolve(ok(await ballotImages.overvoteHmpb()));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.returnBallot();
      await expectStatus(apiClient, {
        state: 'returning',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'returned',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'no_paper',
      });

      // Make sure the ballot was still recorded in the db for backup purposes
      expect(Array.from(workspace.store.forEachSheet())).toHaveLength(1);

      checkLogs(logger);
    }
  );
});

test('invalid ballot rejected', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      workspace,
      mockUsbDrive,
      logger,
      mockAuth,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_ballot_hash',
      };

      simulateScan(mockScanner, await ballotImages.wrongElection(), clock);
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'rejected',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      // Make sure the ballot was still recorded in the db for backup purposes
      expect(Array.from(workspace.store.forEachSheet())).toHaveLength(1);

      checkLogs(logger);
    }
  );
});

test('blank sheet ballot rejected', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'unreadable',
      };

      simulateScan(mockScanner, await ballotImages.blankSheet(), clock);
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'rejected',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('scan fail immediately gives up', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      mockScanner.scan.mockResolvedValue(err(ErrorCode.NoDocumentToBeScanned));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'scanning_failed',
      });
    }
  );
});

test('unexpected interpretation error retries and eventually fails', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      mockAuth,
      workspace,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      mockScanner.scan.mockImplementation(async () => {
        mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
        // Trigger interpretation function exception by removing precinct selection from store
        workspace.store.setPrecinctSelection(undefined);
        return ok(await ballotImages.completeBmd());
      });

      for (let i = 0; i < MAX_FAILED_SCAN_ATTEMPTS; i += 1) {
        mockScanner.move.mockClear();
        const deferredMove = deferred<Result<void, ErrorCode>>();
        mockScanner.move.mockResolvedValue(deferredMove.promise);
        clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
        await waitForExpect(() => {
          expect(mockScanner.scan).toHaveBeenCalledTimes(i + 1);
        });
        await waitForStatus(apiClient, { state: 'returning_to_rescan' });
        expect(mockScanner.move).toHaveBeenCalledWith(
          FormMovement.RETRACT_PAPER_BACKWARD
        );
        mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
        workspace.store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
        deferredMove.resolve(ok());
      }

      await waitForExpect(() => {
        expect(mockScanner.scan).toHaveBeenCalledTimes(
          MAX_FAILED_SCAN_ATTEMPTS + 1
        );
      });
      await waitForStatus(apiClient, {
        state: 'rejecting',
        error: 'client_error',
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'client_error',
      });
    }
  );
});

test('scanning time out', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      logger,
      mockUsbDrive,
      mockAuth,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));

      mockScanner.scan.mockImplementation(async () => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          await sleep(1000);
        }
      });
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'scanning' });
      clock.increment(delays.DELAY_SCANNING_TIMEOUT);
      await waitForStatus(apiClient, {
        state: 'recovering_from_error',
        error: 'scanning_timed_out',
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      clock.increment(delays.DELAY_RECONNECT_ON_UNEXPECTED_ERROR);
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

test("scannerStatusToEvent's cases are exhaustive and can all be reached", () => {
  const eventCounts: Map<ScannerStatusEvent['type'], number> = new Map();
  eventCounts.set('SCANNER_BOTH_SIDES_HAVE_PAPER', 0);
  eventCounts.set('SCANNER_NO_PAPER', 0);
  eventCounts.set('SCANNER_READY_TO_EJECT', 0);
  eventCounts.set('SCANNER_READY_TO_SCAN', 0);

  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1 }), // min and max are both inclusive
      fc.integer({ min: 0, max: 1 }),
      fc.integer({ min: 0, max: 1 }),
      fc.integer({ min: 0, max: 1 }),
      fc.integer({ min: 0, max: 1 }),
      fc.integer({ min: 0, max: 1 }),
      fc.integer({ min: 0, max: 1 }),
      fc.integer({ min: 0, max: 1 }),
      (
        sensorInputLeftLeft,
        sensorInputCenterLeft,
        sensorInputCenterRight,
        sensorInputRightRight,
        sensorOutputLeftLeft,
        sensorOutputCenterLeft,
        sensorOutputCenterRight,
        sensorOutputRightRight
      ) => {
        const scannerStatus: ScannerStatus = {
          sensorInputLeftLeft,
          sensorInputCenterLeft,
          sensorInputCenterRight,
          sensorInputRightRight,
          sensorOutputLeftLeft,
          sensorOutputCenterLeft,
          sensorOutputCenterRight,
          sensorOutputRightRight,

          isDoubleSheet: false,
          isExternalCoverCloseSensor: false,
          isJamPaperHeldBack: false,
          isLoadingPaper: false,
          isMotorOn: false,
          isPaperJam: false,
          isPrintHeadReady: false,
          isScanCanceled: false,
          isScanInProgress: false,
          isScannerCoverOpen: false,
          isTicketLoaded: false,
          isTicketOnEnterA4: false,
          isTicketOnEnterCenter: false,
          isTicketOnExit: false,
          sensorInternalInputLeft: 0xff,
          sensorInternalInputRight: 0xff,
          sensorVoidPrintHead: 0xff,
        };

        // First, ensure that scannerStatusToEvent's cases are exhaustive. We'll know that they are
        // if this line never throws.
        const event = scannerStatusToEvent(scannerStatus);

        const eventCount = assertDefined(
          eventCounts.get(event.type),
          `Unexpected event type: ${event.type}`
        );
        eventCounts.set(event.type, eventCount + 1);
      }
    ),
    { numRuns: 1000 }
  );

  // Second, ensure that scannerStatusToEvent's cases can in fact all be reached
  expect(eventCounts.get('SCANNER_BOTH_SIDES_HAVE_PAPER')).toBeGreaterThan(0);
  expect(eventCounts.get('SCANNER_NO_PAPER')).toBeGreaterThan(0);
  expect(eventCounts.get('SCANNER_READY_TO_EJECT')).toBeGreaterThan(0);
  expect(eventCounts.get('SCANNER_READY_TO_SCAN')).toBeGreaterThan(0);
});

test('scanning paused when election manager card is inserted', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      const electionPackage =
        electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage();
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage,
      });

      mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
        Promise.resolve({
          status: 'logged_in',
          user: mockElectionManagerUser({
            electionKey: constructElectionKey(
              electionPackage.electionDefinition.election
            ),
          }),
          sessionExpiresAt: mockSessionExpiresAt(),
        })
      );

      simulateScan(mockScanner, await ballotImages.completeHmpb(), clock);

      clock.increment(delays.DELAY_APP_READY_TO_SCAN_POLLING_INTERVAL);
      // we don't scan because the election manager card is inserted
      await waitForStatus(apiClient, {
        state: 'hardware_ready_to_scan',
      });

      // remove the card
      mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
        Promise.resolve({
          status: 'logged_out',
          reason: 'no_card',
        })
      );

      // now we can scan
      clock.increment(delays.DELAY_APP_READY_TO_SCAN_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation: {
          type: 'ValidSheet',
        },
      });
    }
  );
});

test('scanning paused when poll worker card is inserted', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      const electionPackage =
        electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage();
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage,
      });

      mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
        Promise.resolve({
          status: 'logged_in',
          user: mockPollWorkerUser({
            electionKey: constructElectionKey(
              electionPackage.electionDefinition.election
            ),
          }),
          sessionExpiresAt: mockSessionExpiresAt(),
        })
      );

      simulateScan(mockScanner, await ballotImages.completeHmpb(), clock);
      clock.increment(delays.DELAY_APP_READY_TO_SCAN_POLLING_INTERVAL);

      // we don't scan because the poll worker card is inserted
      await waitForStatus(apiClient, {
        state: 'hardware_ready_to_scan',
      });

      // remove the card
      mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
        Promise.resolve({
          status: 'logged_out',
          reason: 'no_card',
        })
      );

      // now we can scan
      clock.increment(delays.DELAY_APP_READY_TO_SCAN_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation: {
          type: 'ValidSheet',
        },
      });
    }
  );
});
