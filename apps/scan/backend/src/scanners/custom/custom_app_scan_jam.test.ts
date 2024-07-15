import {
  AdjudicationReason,
  DEFAULT_SYSTEM_SETTINGS,
  SheetInterpretation,
} from '@votingworks/types';
import { ok } from '@votingworks/basics';
import { mocks } from '@votingworks/custom-scanner';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import {
  configureApp,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import {
  ballotImages,
  simulateScan,
  withApp,
} from '../../../test/helpers/custom_helpers';
import { delays } from './state_machine';

jest.setTimeout(20_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

const needsReviewInterpretation: SheetInterpretation = {
  type: 'NeedsReviewSheet',
  reasons: [{ type: AdjudicationReason.BlankBallot }],
};

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_CUSTOM_SCANNER
  );
});

test('jam on scan', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.scan.mockImplementation(() => {
        mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
        // Returns an intentionally broken value to trigger a reconnect.
        return Promise.resolve(ok()) as ReturnType<typeof mockScanner.scan>;
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);

      await waitForStatus(apiClient, {
        state: 'recovering_from_error',
        error: 'client_error',
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      clock.increment(delays.DELAY_RECONNECT_ON_UNEXPECTED_ERROR);
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('jam on accept', async () => {
  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      simulateScan(mockScanner, await ballotImages.completeBmd(), clock);
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await waitForStatus(apiClient, { state: 'accepting', interpretation });
      clock.increment(delays.DELAY_ACCEPTING_TIMEOUT);
      // The paper can't get permanently jammed on accept - it just stays held in
      // the back and we can reject at that point
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
        error: 'paper_in_back_after_accept',
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'paper_in_back_after_accept',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('jam on return', async () => {
  const interpretation = needsReviewInterpretation;
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(
            {
              ...DEFAULT_SYSTEM_SETTINGS,
              precinctScanAdjudicationReasons: [AdjudicationReason.BlankBallot],
            }
          ),
      });

      simulateScan(mockScanner, await ballotImages.unmarkedHmpb(), clock);
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
      await apiClient.returnBallot();
      await waitForStatus(apiClient, {
        state: 'jammed',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('jam on reject', async () => {
  const interpretation: SheetInterpretation = {
    type: 'InvalidSheet',
    reason: 'invalid_ballot_hash',
  };
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      simulateScan(mockScanner, await ballotImages.wrongElection(), clock);
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'jammed',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});
