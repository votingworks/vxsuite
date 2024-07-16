import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { Result, deferred, err, ok, typedAs } from '@votingworks/basics';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  DEFAULT_SYSTEM_SETTINGS,
  SheetInterpretation,
} from '@votingworks/types';
import { ScannerError } from '@votingworks/pdi-scanner';
import { DEFAULT_FAMOUS_NAMES_PRECINCT_ID } from '@votingworks/bmd-ballot-fixtures';
import {
  ballotImages,
  createMockPdiScannerClient,
  mockStatus,
  simulateScan,
  withApp,
} from '../../../test/helpers/pdi_helpers';
import {
  configureApp,
  expectStatus,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { delays } from './state_machine';

jest.setTimeout(20_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('configure and scan hmpb', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      mockAuth,
      logger,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalledWith({
        doubleFeedDetectionEnabled: true,
        paperLengthInches: 11,
      });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.completeHmpb()
      );

      const interpretation: SheetInterpretation = { type: 'ValidSheet' };
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith('toRear');
      mockScanner.setScannerStatus(mockStatus.idleScanningDisabled);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });

      // Test waiting for automatic transition back to no_paper
      clock.increment(delays.DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT);
      await waitForStatus(apiClient, { state: 'no_paper', ballotsCounted: 1 });

      // Do some basic logging checks to ensure that we're logging state machine changes
      // Make sure we got a transition
      expect(logger.log).toHaveBeenCalledWith(
        'scanner-state-machine-transition',
        'system',
        { message: 'Transitioned to: {"waitingForBallot":"checkingStatus"}' },
        expect.any(Function)
      );
      // Make sure we got an event
      expect(logger.log).toHaveBeenCalledWith(
        'scanner-state-machine-event',
        'system',
        {
          message: 'Event: SCANNER_STATUS',
          eventObject: expect.stringContaining('"documentInScanner":false'),
        },
        expect.any(Function)
      );
      // Make sure we got a context update. And make sure we didn't log the votes in
      // the interpretation to protect voter privacy.
      expect(logger.log).toHaveBeenCalledWith(
        'scanner-state-machine-transition',
        'system',
        {
          message: 'Context updated',
          changedFields: expect.stringMatching(
            /"type":"ValidSheet".*"votes":"\[hidden\]"/
          ),
        },
        expect.any(Function)
      );
    }
  );
});

test('configure and scan bmd ballot', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalledWith({
        doubleFeedDetectionEnabled: true,
        paperLengthInches: 11,
      });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.completeBmd()
      );

      const interpretation: SheetInterpretation = { type: 'ValidSheet' };
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith('toRear');
      mockScanner.setScannerStatus(mockStatus.idleScanningDisabled);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });
    }
  );
});

test('ballot needs review - return', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      mockAuth,
      workspace,
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

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.overvoteHmpb()
      );

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
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.returnBallot();
      await expectStatus(apiClient, { state: 'returning', interpretation });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith(
        'toFrontAndHold'
      );
      mockScanner.setScannerStatus(mockStatus.documentInFront);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, { state: 'returned', interpretation });

      // Simulate voter removing ballot
      mockScanner.setScannerStatus(mockStatus.idleScanningDisabled);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await expectStatus(apiClient, { state: 'no_paper' });

      // Make sure the ballot was still recorded in the db for backup purposes
      expect(Array.from(workspace.store.forEachSheet())).toHaveLength(1);
    }
  );
});

test('ballot needs review - accept', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(
            {
              ...DEFAULT_SYSTEM_SETTINGS,
              precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
            }
          ),
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.overvoteHmpb()
      );

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
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting_after_review',
        interpretation,
      });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith('toRear');
      mockScanner.setScannerStatus(mockStatus.idleScanningDisabled);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });
    }
  );
});

test('ballot with wrong election rejected', async () => {
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

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.wrongElectionBmd()
      );

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_ballot_hash',
      };
      await waitForStatus(apiClient, { state: 'rejecting', interpretation });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith(
        'toFrontAndHold'
      );
      mockScanner.setScannerStatus(mockStatus.documentInFront);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, { state: 'rejected', interpretation });

      // Simulate voter removing ballot
      mockScanner.setScannerStatus(mockStatus.idleScanningDisabled);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await expectStatus(apiClient, { state: 'no_paper' });

      // Make sure the ballot was still recorded in the db for backup purposes
      expect(Array.from(workspace.store.forEachSheet())).toHaveLength(1);
    }
  );
});

test('ballot with wrong precinct rejected', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        precinctId: '22',
        testMode: true,
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.completeBmd()
      );

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_precinct',
      };
      await waitForStatus(apiClient, { state: 'rejecting', interpretation });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith(
        'toFrontAndHold'
      );
      mockScanner.setScannerStatus(mockStatus.documentInFront);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, { state: 'rejected', interpretation });
    }
  );
});

test('blank sheet rejected', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.blankSheet()
      );

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'unknown',
      };
      await waitForStatus(apiClient, { state: 'rejecting', interpretation });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith(
        'toFrontAndHold'
      );
      mockScanner.setScannerStatus(mockStatus.documentInFront);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, { state: 'rejected', interpretation });
    }
  );
});

test('if scan fails, ballot rejected', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      mockScanner.emitEvent({ event: 'scanStart' });
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.setScannerStatus(mockStatus.documentInRear);
      mockScanner.emitEvent({ event: 'error', code: 'scanFailed' });

      await waitForStatus(apiClient, {
        state: 'rejecting',
        error: 'scanning_failed',
      });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith(
        'toFrontAndHold'
      );
      mockScanner.setScannerStatus(mockStatus.documentInFront);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'scanning_failed',
      });
    }
  );
});

test('if interpretation throws an exception, ballot rejected', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      mockScanner.emitEvent({ event: 'scanStart' });
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.setScannerStatus(mockStatus.documentInRear);
      mockScanner.emitEvent({
        event: 'scanComplete',
        // @ts-expect-error This shouldn't ever happen, but it's a way to
        // trigger an exception in the interpretation function
        images: [],
      });

      await waitForStatus(apiClient, {
        state: 'rejecting',
        error: 'client_error',
      });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith(
        'toFrontAndHold'
      );
      mockScanner.setScannerStatus(mockStatus.documentInFront);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'client_error',
      });
    }
  );
});

test('if scanning times out, ballot rejected', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      mockAuth,
      clock,
      logger,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      mockScanner.setScannerStatus(mockStatus.documentInFront);
      mockScanner.emitEvent({ event: 'scanStart' });
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.setScannerStatus(mockStatus.documentInRear);

      // If scanning times out, we expect the scanner client to be exited and a
      // new client to be created
      const deferredExit = deferred<Result<void, ScannerError>>();
      mockScanner.client.exit.mockReturnValueOnce(deferredExit.promise);
      const oldMockScannerClient = mockScanner.client;

      const newMockScanner = createMockPdiScannerClient();
      newMockScanner.client.connect.mockResolvedValueOnce(ok());
      newMockScanner.setScannerStatus(mockStatus.documentInRear);
      // `withApp` sets up the mocks to return `mockScanner.client` when
      // `createPdiScannerClient` is called, so we mutate it to point to our new
      // client.
      // eslint-disable-next-line no-param-reassign
      mockScanner.client = newMockScanner.client;

      clock.increment(delays.DELAY_SCANNING_TIMEOUT);
      await waitForStatus(apiClient, {
        state: 'recovering_from_error',
        error: 'scanning_timed_out',
      });
      deferredExit.resolve(ok());
      expect(oldMockScannerClient.exit).toHaveBeenCalled();

      await waitForStatus(apiClient, {
        state: 'rejecting',
        error: 'paper_in_back_after_reconnect',
      });
      expect(newMockScanner.client.connect).toHaveBeenCalled();

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

      // Make sure event listener was added to new client (regression test for
      // bug where we weren't adding the root event listener to the new client)
      newMockScanner.setScannerStatus(mockStatus.coverOpen);
      newMockScanner.emitEvent({ event: 'coverOpen' });
      await waitForStatus(apiClient, { state: 'cover_open' });
    }
  );
});

test('if reconnect fails after error, restart required', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.client.getScannerStatus.mockResolvedValue(
        err({ code: 'other', message: 'some error' })
      );
      mockScanner.client.exit.mockRejectedValue(err({ code: 'disconnected' }));
      mockScanner.client.connect.mockRejectedValue(
        err({ code: 'other', message: 'some error' })
      );
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);

      await waitForStatus(apiClient, { state: 'unrecoverable_error' });
      expect(mockScanner.client.exit).toHaveBeenCalled();
      expect(mockScanner.client.connect).toHaveBeenCalled();
    }
  );
});
