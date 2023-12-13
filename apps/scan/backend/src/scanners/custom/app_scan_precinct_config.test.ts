import { ok } from '@votingworks/basics';
import { mocks } from '@votingworks/custom-scanner';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { SheetInterpretation } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
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

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('bmd ballot is rejected when scanned for wrong precinct', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      // Ballot should be rejected when configured for the wrong precinct
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        precinctId: '22',
        testMode: true,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_precinct',
      };

      simulateScan(mockScanner, await ballotImages.completeBmd());
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

test('bmd ballot is accepted if precinct is set for the right precinct', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      // Configure for the proper precinct and verify the ballot scans
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        precinctId: '23',
        testMode: true,
      });

      const validInterpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      simulateScan(mockScanner, await ballotImages.completeBmd());
      await apiClient.scanBallot();
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation: validInterpretation,
      });
    }
  );
});

test('hmpb ballot is rejected when scanned for wrong precinct', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      // Ballot should be rejected when configured for the wrong precinct
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
        precinctId: '22',
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_precinct',
      };

      simulateScan(mockScanner, await ballotImages.completeHmpb());
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

test('hmpb ballot is accepted if precinct is set for the right precinct', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      // Configure for the proper precinct and verify the ballot scans
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        electionPackage:
          electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage(),
        precinctId: 'town-id-00701-precinct-id-',
      });

      const validInterpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      await waitForStatus(apiClient, { state: 'ready_to_scan' });

      simulateScan(mockScanner, await ballotImages.completeHmpb());
      await apiClient.scanBallot();
      await waitForStatus(apiClient, {
        state: 'ready_to_accept',
        interpretation: validInterpretation,
      });
    }
  );
});
