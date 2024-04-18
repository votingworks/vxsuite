import * as fc from 'fast-check';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  DEFAULT_SYSTEM_SETTINGS,
  SheetInterpretation,
} from '@votingworks/types';
import waitForExpect from 'wait-for-expect';
import { assertDefined, err, ok, sleep, typedAs } from '@votingworks/basics';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { BaseLogger } from '@votingworks/logging';
import { ErrorCode, ScannerStatus, mocks } from '@votingworks/custom-scanner';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import { doesUsbDriveRequireCastVoteRecordSync } from '@votingworks/backend';
import {
  MAX_FAILED_SCAN_ATTEMPTS,
  ScannerStatusEvent,
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
import { BALLOT_BAG_CAPACITY } from '../../globals';

jest.setTimeout(20_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

jest.mock('@votingworks/backend', () => ({
  ...jest.requireActual('@votingworks/backend'),
  doesUsbDriveRequireCastVoteRecordSync: jest.fn(),
}));

const doesUsbDriveRequireCastVoteRecordSyncMock = mockOf(
  doesUsbDriveRequireCastVoteRecordSync
);

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
        /{"interpretation":"(ValidSheet|InvalidSheet|NeedsReviewSheet)"}/
      ),
    },
    expect.any(Function)
  );
}

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('configure and scan hmpb', async () => {
  await withApp(
    {
      delays: { DELAY_ACCEPTED_RESET_TO_NO_PAPER: 1500 },
    },
    async ({ apiClient, mockScanner, mockUsbDrive, logger, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      simulateScan(mockScanner, await ballotImages.completeHmpb());
      await waitForStatus(apiClient, { state: 'scanning' });
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

      checkLogs(logger);
    }
  );
});

test('configure and scan bmd ballot', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, logger, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      simulateScan(mockScanner, await ballotImages.completeBmd());
      await waitForStatus(apiClient, { state: 'scanning' });
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });

      // Test scanning again without first transitioning back to no_paper
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));

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
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(
            {
              ...DEFAULT_SYSTEM_SETTINGS,
              precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
            }
          ),
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));

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

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_election_hash',
      };

      simulateScan(mockScanner, await ballotImages.wrongElection());
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

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'unknown',
      };

      simulateScan(mockScanner, await ballotImages.blankSheet());
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
      mockScanner.scan.mockResolvedValue(err(ErrorCode.NoDocumentToBeScanned));
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'scanning_failed',
      });
    }
  );
});

test('unexpected interpretation error retries and eventually fails', async () => {
  const interpret = jest.fn();

  await withApp(
    {
      interpret,
    },
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      mockScanner.scan.mockImplementation(async () => {
        mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
        return Promise.resolve(ok(await ballotImages.blankSheet()));
      });

      interpret.mockImplementation(() => {
        mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
        throw new Error('interpret error');
      });

      for (let i = 0; i < MAX_FAILED_SCAN_ATTEMPTS; i += 1) {
        await waitForExpect(() => {
          expect(mockScanner.scan).toHaveBeenCalledTimes(i + 1);
        });
        await waitForExpect(() => {
          expect(interpret).toHaveBeenCalledTimes(i + 1);
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

      mockScanner.scan.mockImplementation(async () => {
        await sleep(1000);
        return ok(await ballotImages.completeBmd());
      });
      await waitForStatus(apiClient, { state: 'scanning' });
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
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      const electionPackage =
        electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage();
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage,
      });

      mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
        Promise.resolve({
          status: 'logged_in',
          user: mockElectionManagerUser(electionPackage.electionDefinition),
          sessionExpiresAt: mockSessionExpiresAt(),
        })
      );

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      simulateScan(mockScanner, await ballotImages.completeHmpb());

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
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation: {
          type: 'ValidSheet',
        },
      });
    }
  );
});

test('scanning paused when poll worker card is inserted', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      const electionPackage =
        electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage();
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage,
      });

      mockOf(mockAuth.getAuthStatus).mockImplementation(() =>
        Promise.resolve({
          status: 'logged_in',
          user: mockPollWorkerUser(electionPackage.electionDefinition),
          sessionExpiresAt: mockSessionExpiresAt(),
        })
      );

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      simulateScan(mockScanner, await ballotImages.completeHmpb());

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
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation: {
          type: 'ValidSheet',
        },
      });
    }
  );
});

test('scanning paused when ballot bag needs replacement', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, workspace }) => {
      const electionPackage =
        electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage();
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage,
      });

      workspace.store.setBallotCountWhenBallotBagLastReplaced(0);
      jest
        .spyOn(workspace.store, 'getBallotsCounted')
        .mockReturnValue(BALLOT_BAG_CAPACITY);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      simulateScan(mockScanner, await ballotImages.completeHmpb());

      // we don't scan because the ballot bag needs replacement
      await waitForStatus(apiClient, {
        state: 'hardware_ready_to_scan',
        ballotsCounted: BALLOT_BAG_CAPACITY,
      });

      // replace the ballot bag
      workspace.store.setBallotCountWhenBallotBagLastReplaced(
        BALLOT_BAG_CAPACITY
      );

      // ensure CVRs appear synced
      doesUsbDriveRequireCastVoteRecordSyncMock.mockResolvedValue(false);

      // now we can scan
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation: {
          type: 'ValidSheet',
        },
        ballotsCounted: BALLOT_BAG_CAPACITY,
      });
    }
  );
});
