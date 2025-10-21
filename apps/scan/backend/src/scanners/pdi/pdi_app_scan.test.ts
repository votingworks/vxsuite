import { err, sleep, typedAs } from '@votingworks/basics';
import { DEFAULT_FAMOUS_NAMES_PRECINCT_ID } from '@votingworks/bmd-ballot-fixtures';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { mockScannerStatus } from '@votingworks/pdi-scanner';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  DEFAULT_SYSTEM_SETTINGS,
  SheetInterpretation,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { LogEventId } from '@votingworks/logging';
import {
  ballotImages,
  simulateScan,
  withApp,
} from '../../../test/helpers/pdi_helpers';
import {
  configureApp,
  expectStatus,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { delays } from './state_machine';

vi.setConfig({ testTimeout: 20_000 });

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

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
        testMode: true,
        electionPackage: {
          electionDefinition: vxFamousNamesFixtures.electionDefinition,
        },
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
        state: 'accepting',
        interpretation,
      });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith('toRear');
      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });

      await apiClient.readyForNextBallot();
      await waitForStatus(apiClient, { state: 'no_paper', ballotsCounted: 1 });

      // Do some basic logging checks to ensure that we're logging state machine changes
      // Make sure we got a transition
      expect(logger.log).toHaveBeenCalledWith(
        'scanner-state-machine-transition',
        'system',
        {
          message: 'Transitioned to: {"waitingForBallot":"checkingStatus"}',
          newState: '{"waitingForBallot":"checkingStatus"}',
        },
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
        state: 'accepting',
        interpretation,
      });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith('toRear');
      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
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
        testMode: true,
        electionPackage: {
          electionDefinition: vxFamousNamesFixtures.electionDefinition,
          systemSettings: {
            ...DEFAULT_SYSTEM_SETTINGS,
            precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
          },
        },
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
        reasons: expect.arrayContaining([
          expect.objectContaining(
            typedAs<Partial<AdjudicationReasonInfo>>({
              type: AdjudicationReason.Overvote,
            })
          ),
        ]),
      };
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.returnBallot();
      await expectStatus(apiClient, { state: 'returning', interpretation });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith(
        'toFrontAndHold'
      );
      mockScanner.setScannerStatus(mockScannerStatus.documentInFront);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, { state: 'returned', interpretation });

      // Simulate voter removing ballot
      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
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
        testMode: true,
        electionPackage: {
          electionDefinition: vxFamousNamesFixtures.electionDefinition,
          systemSettings: {
            ...DEFAULT_SYSTEM_SETTINGS,
            precinctScanAdjudicationReasons: [AdjudicationReason.Overvote],
          },
        },
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
        reasons: expect.arrayContaining([
          expect.objectContaining(
            typedAs<Partial<AdjudicationReasonInfo>>({
              type: AdjudicationReason.Overvote,
            })
          ),
        ]),
      };
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.acceptBallot();
      await expectStatus(apiClient, {
        state: 'accepting_after_review',
        interpretation,
      });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith('toRear');
      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
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
      mockScanner.setScannerStatus(mockScannerStatus.documentInFront);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, { state: 'rejected', interpretation });

      // Simulate voter removing ballot
      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
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
      mockScanner.setScannerStatus(mockScannerStatus.documentInFront);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, { state: 'rejected', interpretation });
    }
  );
});

test('BMD ballot rejected when BMD ballot scanning disabled', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage: {
          electionDefinition:
            electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition(),
          systemSettings: {
            ...DEFAULT_SYSTEM_SETTINGS,
            precinctScanEnableBmdBallotScanning: false,
          },
        },
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
        reason: 'bmd_ballot_scanning_disabled',
      };
      await waitForStatus(apiClient, { state: 'rejecting', interpretation });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith(
        'toFrontAndHold'
      );
      mockScanner.setScannerStatus(mockScannerStatus.documentInFront);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, { state: 'rejected', interpretation });
    }
  );
});

test('ballot printed at an invalid scale is rejected', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage: {
          electionDefinition:
            electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition(),
          systemSettings: {
            ...DEFAULT_SYSTEM_SETTINGS,
            minimumDetectedBallotScaleOverride: 1.0,
          },
        },
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.completeHmpbInvalidScale()
      );

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_scale',
      };
      await waitForStatus(apiClient, { state: 'rejecting', interpretation });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith(
        'toFrontAndHold'
      );
      mockScanner.setScannerStatus(mockScannerStatus.documentInFront);
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
        reason: 'unreadable',
      };
      await waitForStatus(apiClient, { state: 'rejecting', interpretation });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith(
        'toFrontAndHold'
      );
      mockScanner.setScannerStatus(mockScannerStatus.documentInFront);
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
      mockScanner.setScannerStatus(mockScannerStatus.documentInRear);
      mockScanner.emitEvent({ event: 'error', code: 'scanFailed' });

      await waitForStatus(apiClient, {
        state: 'rejecting',
        error: 'scanning_failed',
      });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith(
        'toFrontAndHold'
      );
      mockScanner.setScannerStatus(mockScannerStatus.documentInFront);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'scanning_failed',
      });
    }
  );
});

test('if ballot removed during scan, returns to waiting for ballots', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      mockScanner.emitEvent({ event: 'scanStart' });
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.setScannerStatus(mockScannerStatus.idleScanningEnabled);
      mockScanner.emitEvent({
        event: 'scanComplete',
        images: await ballotImages.blankSheet(), // Shouldn't matter
      });

      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('if ballot teased and jam error code occurs, tries to reject ballot', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      mockScanner.emitEvent({ event: 'scanStart' });
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.setScannerStatus({
        ...mockScannerStatus.documentInFront,
        documentJam: true,
      });
      mockScanner.emitEvent({
        event: 'scanComplete',
        images: await ballotImages.blankSheet(),
      });

      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'scanning_failed',
      });
    }
  );
});

test('if interpretation throws an exception, show unrecoverable error', async () => {
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

      mockScanner.emitEvent({ event: 'scanStart' });
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.setScannerStatus(mockScannerStatus.documentInRear);
      mockScanner.emitEvent({
        event: 'scanComplete',
        // @ts-expect-error This shouldn't ever happen, but it's a way to
        // trigger an exception in the interpretation function
        images: [],
      });

      await waitForStatus(apiClient, {
        state: 'unrecoverable_error',
      });
      // Make sure the underlying error got logged correctly
      expect(logger.log).toHaveBeenCalledWith(
        'scanner-state-machine-transition',
        'system',
        {
          message: 'Context updated',
          changedFields: expect.stringMatching(/{"error":.*Error/),
        },
        expect.any(Function)
      );
    }
  );
});

test('if scanning times out, show unrecoverable error', async () => {
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

      mockScanner.setScannerStatus(mockScannerStatus.documentInFront);
      mockScanner.emitEvent({ event: 'scanStart' });
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.setScannerStatus(mockScannerStatus.documentInRear);

      clock.increment(delays.DELAY_SCANNING_TIMEOUT);
      await waitForStatus(apiClient, {
        state: 'unrecoverable_error',
      });

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

test('if scanner status errors, show unrecoverable error', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      mockScanner.client.getScannerStatus.mockResolvedValue(
        err({ code: 'other', message: 'some error' })
      );
      await configureApp(apiClient, mockAuth, mockUsbDrive);
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'unrecoverable_error',
      });
    }
  );
});

test('avoid logging successive SCANNING_ENABLED and SCANNING_DISABLED events', async () => {
  await withApp(
    async ({ apiClient, mockUsbDrive, mockAuth, clock, logger }) => {
      const logSpy = vi.spyOn(logger, 'log');
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      // Scanning is enabled
      for (let i = 0; i < 5; i += 1) {
        clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
        await sleep(1); // Need a sleep to let logs emit
      }

      // Inserting a smart card disables scanning
      vi.mocked(mockAuth.getAuthStatus).mockImplementation(() =>
        Promise.resolve({
          status: 'logged_in',
          user: mockSystemAdministratorUser(),
          sessionExpiresAt: mockSessionExpiresAt(),
        })
      );

      // Scanning is disabled
      for (let i = 0; i < 5; i += 1) {
        clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
        await sleep(1); // Need a sleep to let logs emit
      }

      const scanningEnabledMessage = 'Event: SCANNING_ENABLED';
      const scanningDisabledMessage = 'Event: SCANNING_DISABLED';

      const scannerEventLogMessages = logSpy.mock.calls
        .filter((call) => call[0] === LogEventId.ScannerEvent)
        .map((call) => call[2]?.message);
      expect(scannerEventLogMessages).toContain(scanningEnabledMessage);
      expect(scannerEventLogMessages).toContain(scanningDisabledMessage);

      function hasConsecutiveElement(
        array: Array<string | undefined>,
        element: string
      ) {
        for (let i = 0; i < array.length - 1; i += 1) {
          if (array[i] === element && array[i + 1] === element) {
            return true;
          }
        }
        return false;
      }
      expect(
        hasConsecutiveElement(scannerEventLogMessages, scanningEnabledMessage)
      ).toEqual(false);
      expect(
        hasConsecutiveElement(scannerEventLogMessages, scanningDisabledMessage)
      ).toEqual(false);
    }
  );
});
