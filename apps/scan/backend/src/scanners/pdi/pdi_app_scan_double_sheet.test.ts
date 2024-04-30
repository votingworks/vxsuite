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
  ballotImages,
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
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_PDI_SCANNER
  );
});

test('insert second ballot before first ballot accept', async () => {
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
      mockScanner.setScannerStatus(mockStatus.documentInFrontAndRear);
      mockScanner.emitEvent({
        event: 'scanComplete',
        images: await ballotImages.completeHmpb(),
      });

      const interpretation: SheetInterpretation = { type: 'ValidSheet' };
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await waitForStatus(apiClient, {
        state: 'both_sides_have_paper',
        interpretation,
      });

      mockScanner.setScannerStatus(mockStatus.documentInRear);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });

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

test('insert second ballot while first ballot is accepting', async () => {
  const interpretation: SheetInterpretation = { type: 'ValidSheet' };
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
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      mockScanner.setScannerStatus(mockStatus.documentInFrontAndRear);
      await apiClient.acceptBallot();
      await waitForStatus(apiClient, {
        state: 'both_sides_have_paper',
        interpretation,
      });

      mockScanner.setScannerStatus(mockStatus.documentInRear);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation,
      });
    }
  );
});

test('insert second ballot while first ballot is accepted after review', async () => {
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

      mockScanner.setScannerStatus(mockStatus.documentInFrontAndRear);
      await apiClient.acceptBallot();
      await waitForStatus(apiClient, {
        state: 'both_sides_have_paper',
        interpretation,
      });

      mockScanner.setScannerStatus(mockStatus.documentInRear);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'accepting_after_review',
        interpretation,
      });
    }
  );
});
