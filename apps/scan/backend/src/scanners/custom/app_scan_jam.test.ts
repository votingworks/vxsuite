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
});

test('jam on scan', async () => {
  await withApp(
    {
      delays: {
        DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 500,
      },
    },
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      await apiClient.scanBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
      await waitForStatus(apiClient, {
        state: 'recovering_from_error',
        error: 'client_error',
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('jam on accept', async () => {
  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };
  await withApp(
    {
      delays: {
        DELAY_ACCEPTING_TIMEOUT: 500,
      },
    },
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      simulateScan(mockScanner, await ballotImages.completeBmd());
      await apiClient.scanBallot();
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation,
      });

      await apiClient.acceptBallot();
      await waitForStatus(apiClient, { state: 'accepting', interpretation });
      // The paper can't get permanently jammed on accept - it just stays held in
      // the back and we can reject at that point
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
        error: 'paper_in_back_after_accept',
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, {
        state: 'rejected',
        error: 'paper_in_back_after_accept',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('jam on return', async () => {
  const interpretation = needsReviewInterpretation;
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(
            {
              ...DEFAULT_SYSTEM_SETTINGS,
              precinctScanAdjudicationReasons: [AdjudicationReason.BlankBallot],
            }
          ),
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      simulateScan(mockScanner, await ballotImages.unmarkedHmpb());
      await apiClient.scanBallot();
      await waitForStatus(apiClient, { state: 'needs_review', interpretation });

      await apiClient.returnBallot();
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
      await waitForStatus(apiClient, {
        state: 'jammed',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('jam on reject', async () => {
  const interpretation: SheetInterpretation = {
    type: 'InvalidSheet',
    reason: 'invalid_election_hash',
  };
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      simulateScan(mockScanner, await ballotImages.wrongElection());
      await apiClient.scanBallot();
      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
      await waitForStatus(apiClient, {
        state: 'jammed',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});
