import {
  getFeatureFlagMock,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  DEFAULT_SYSTEM_SETTINGS,
  SheetInterpretation,
} from '@votingworks/types';
import { typedAs } from '@votingworks/basics';
import {
  mockElectionManagerUser,
  mockOf,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { LogEventId } from '@votingworks/logging';
import { mockScannerStatus } from '@votingworks/pdi-scanner';
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

jest.setTimeout(20_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('insert second ballot after scan', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      mockScanner.emitEvent({ event: 'scanStart' });
      await expectStatus(apiClient, { state: 'scanning' });
      mockScanner.setScannerStatus(mockScannerStatus.documentInFrontAndRear);
      mockScanner.emitEvent({
        event: 'scanComplete',
        images: await ballotImages.completeHmpb(),
      });

      const interpretation: SheetInterpretation = { type: 'ValidSheet' };
      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });

      mockScanner.emitEvent({ event: 'ejectPaused' });
      await waitForStatus(apiClient, {
        state: 'both_sides_have_paper',
        interpretation,
      });

      mockScanner.setScannerStatus(mockScannerStatus.documentInRear);
      mockScanner.emitEvent({ event: 'ejectResumed' });
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });

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

test('insert second ballot before accept', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

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

      mockScanner.setScannerStatus(mockScannerStatus.documentInFrontAndRear);
      mockScanner.emitEvent({ event: 'ejectPaused' });
      await waitForStatus(apiClient, {
        state: 'both_sides_have_paper',
        interpretation,
      });

      mockScanner.setScannerStatus(mockScannerStatus.documentInRear);
      mockScanner.emitEvent({ event: 'ejectResumed' });
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });
    }
  );
});

test('insert second ballot during accept', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

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

      // Simulate that the first ballot was already ejected when the second
      // ballot is inserted
      mockScanner.setScannerStatus(mockScannerStatus.documentInFront);
      mockScanner.emitEvent({ event: 'ejectPaused' });
      await waitForStatus(apiClient, {
        state: 'both_sides_have_paper',
        interpretation,
      });

      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
      mockScanner.emitEvent({ event: 'ejectResumed' });
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 1,
      });
    }
  );
});

test('insert second ballot before accept after review', async () => {
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

      mockScanner.setScannerStatus(mockScannerStatus.documentInFrontAndRear);
      await apiClient.acceptBallot();
      mockScanner.emitEvent({ event: 'ejectPaused' });
      await waitForStatus(apiClient, {
        state: 'both_sides_have_paper',
        interpretation,
      });

      mockScanner.setScannerStatus(mockScannerStatus.documentInRear);
      mockScanner.emitEvent({ event: 'ejectResumed' });
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepting_after_review',
        interpretation,
      });
    }
  );
});

test('insert second ballot after accept, should be scanned', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

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

      mockScanner.client.enableScanning.mockClear();
      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      const ballotsCounted = 1;
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted,
      });
      // Ensure that scanning was disabled and not re-enabled yet
      expect(mockScanner.client.ejectDocument).toHaveBeenCalled(); // Disables scanning
      expect(mockScanner.client.enableScanning).not.toHaveBeenCalled();

      // Simulate inserting a second ballot
      mockScanner.setScannerStatus(mockScannerStatus.documentInFront);

      clock.increment(delays.DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT);
      await waitForStatus(apiClient, {
        state: 'no_paper',
        ballotsCounted,
      });
      expect(mockScanner.client.enableScanning).toHaveBeenCalled();
      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.completeHmpb(),
        ballotsCounted
      );
      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation,
        ballotsCounted,
      });
    }
  );
});

test('insert two sheets back-to-back as if they were one long sheet', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      mockScanner.emitEvent({ event: 'scanStart' });
      await expectStatus(apiClient, { state: 'scanning' });
      // Since we set the max paper length, the scanner will declare a jam in
      // this case
      mockScanner.setScannerStatus(mockScannerStatus.jammed);
      mockScanner.emitEvent({
        event: 'scanComplete',
        images: await ballotImages.completeBmd(),
      });
      await waitForStatus(apiClient, { state: 'jammed' });

      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('insert two sheets at once - scanFailed event', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      mockScanner.emitEvent({ event: 'scanStart' });
      await expectStatus(apiClient, { state: 'scanning' });
      // Scanner stops the scan immediately when multiple sheets are detected,
      // usually before the rear sensors are covered
      mockScanner.setScannerStatus(mockScannerStatus.documentInFront);
      mockScanner.emitEvent({ event: 'error', code: 'doubleFeedDetected' });
      mockScanner.emitEvent({ event: 'error', code: 'scanFailed' });

      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'double_feed_detected',
      });

      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('insert two sheets at once - scanComplete event', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });

      mockScanner.emitEvent({ event: 'scanStart' });
      await expectStatus(apiClient, { state: 'scanning' });
      // In this case, the scanner seems to set the documentJam flag as well
      mockScanner.setScannerStatus({
        ...mockScannerStatus.documentInFront,
        documentJam: true,
      });
      mockScanner.emitEvent({ event: 'error', code: 'doubleFeedDetected' });
      mockScanner.emitEvent({
        event: 'scanComplete',
        images: await ballotImages.completeHmpb(),
      });

      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'double_feed_detected',
      });

      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('disabling double feed detection', async () => {
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
      await apiClient.setIsDoubleFeedDetectionDisabled({
        isDoubleFeedDetectionDisabled: true,
      });
      expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
        LogEventId.DoubleSheetDetectionToggled,
        {
          message: expect.anything(),
          disposition: 'success',
          isDoubleFeedDetectionDisabled: true,
        }
      );

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
      expect(mockScanner.client.enableScanning).toHaveBeenLastCalledWith(
        expect.objectContaining({
          doubleFeedDetectionEnabled: false,
        })
      );

      // Simulate an election manager logging in to disable double feed
      // detection, since that's how it would happen in real-world usage. The
      // state machine only calls enableScanning when it transitions back into
      // the 'waitingForBallot' state, so we need to log out to trigger the
      // transition to 'paused' first to actually register the change.
      mockOf(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockElectionManagerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });
      await apiClient.setIsDoubleFeedDetectionDisabled({
        isDoubleFeedDetectionDisabled: false,
      });
      mockOf(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_out',
        reason: 'no_card',
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
      expect(mockScanner.client.enableScanning).toHaveBeenLastCalledWith(
        expect.objectContaining({
          doubleFeedDetectionEnabled: true,
        })
      );
    }
  );
});
