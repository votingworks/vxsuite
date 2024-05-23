import {
  AdjudicationReason,
  DEFAULT_SYSTEM_SETTINGS,
  SheetInterpretation,
} from '@votingworks/types';
import { ErrorCode, mocks } from '@votingworks/custom-scanner';
import { err, ok } from '@votingworks/basics';
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
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_CUSTOM_SCANNER
  );
});

test('scanner powered off while waiting for paper', async () => {
  await withApp(async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive);

    mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
    await waitForStatus(apiClient, { state: 'disconnected' });

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
    await waitForStatus(apiClient, { state: 'no_paper' });
  });
});

test('scanner powered off while scanning', async () => {
  await withApp(async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

    simulateScan(mockScanner, await ballotImages.completeBmd());
    mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
    await waitForStatus(apiClient, { state: 'disconnected' });

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
    await waitForStatus(apiClient, { state: 'jammed' });
  });
});

test('scanner powered off while accepting', async () => {
  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };
  await withApp(async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

    simulateScan(mockScanner, await ballotImages.completeBmd());
    await waitForStatus(apiClient, {
      state: 'ready_to_accept',
      interpretation,
    });
    await apiClient.acceptBallot();
    mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
    await waitForStatus(apiClient, { state: 'disconnected' });

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
    await waitForStatus(apiClient, {
      state: 'rejecting',
      error: 'paper_in_back_after_reconnect',
    });
    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
    await waitForStatus(apiClient, {
      state: 'rejected',
      error: 'paper_in_back_after_reconnect',
    });
  });
});

test('scanner powered off after accepting', async () => {
  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };
  await withApp(async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

    simulateScan(mockScanner, await ballotImages.completeBmd());
    await waitForStatus(apiClient, {
      state: 'ready_to_accept',
      interpretation,
    });
    await apiClient.acceptBallot();
    await waitForStatus(apiClient, {
      state: 'accepting',
      interpretation,
    });
    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
    await waitForStatus(apiClient, {
      state: 'accepted',
      interpretation,
      ballotsCounted: 1,
    });

    mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
    await waitForStatus(apiClient, {
      state: 'disconnected',
      ballotsCounted: 1,
    });

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
    await waitForStatus(apiClient, {
      state: 'no_paper',
      ballotsCounted: 1,
    });
  });
});

test('scanner powered off while rejecting', async () => {
  const interpretation: SheetInterpretation = {
    type: 'InvalidSheet',
    reason: 'invalid_election_hash',
  };
  await withApp(async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive);

    simulateScan(mockScanner, await ballotImages.wrongElection());
    await waitForStatus(apiClient, {
      state: 'rejecting',
      interpretation,
    });

    mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
    await waitForStatus(apiClient, { state: 'disconnected' });

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
    await waitForStatus(apiClient, { state: 'jammed' });
  });
});

test('scanner powered off while returning', async () => {
  const interpretation = needsReviewInterpretation;
  await withApp(async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, {
      electionPackage:
        electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(
          {
            ...DEFAULT_SYSTEM_SETTINGS,
            precinctScanAdjudicationReasons: [AdjudicationReason.BlankBallot],
          }
        ),
    });

    simulateScan(mockScanner, await ballotImages.unmarkedHmpb());
    await waitForStatus(apiClient, { state: 'needs_review', interpretation });

    await apiClient.returnBallot();
    await waitForStatus(apiClient, {
      state: 'returning',
      interpretation,
    });

    mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
    await waitForStatus(apiClient, { state: 'disconnected' });

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_INTERNAL_JAM));
    await waitForStatus(apiClient, { state: 'jammed' });
  });
});

test('scanner powered off after returning', async () => {
  const interpretation = needsReviewInterpretation;
  await withApp(async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, {
      electionPackage:
        electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(
          {
            ...DEFAULT_SYSTEM_SETTINGS,
            precinctScanAdjudicationReasons: [AdjudicationReason.BlankBallot],
          }
        ),
    });

    simulateScan(mockScanner, await ballotImages.unmarkedHmpb());
    await waitForStatus(apiClient, { state: 'needs_review', interpretation });

    await apiClient.returnBallot();
    await waitForStatus(apiClient, {
      state: 'returning',
      interpretation,
    });
    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
    await waitForStatus(apiClient, {
      state: 'returned',
      interpretation,
    });

    mockScanner.getStatus.mockResolvedValue(err(ErrorCode.ScannerOffline));
    await waitForStatus(apiClient, { state: 'disconnected' });

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
    await waitForStatus(apiClient, {
      state: 'rejected',
      error: 'paper_in_front_after_reconnect',
    });
  });
});
