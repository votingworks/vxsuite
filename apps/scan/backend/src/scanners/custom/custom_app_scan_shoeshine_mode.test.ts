import { ok } from '@votingworks/basics';
import { mocks } from '@votingworks/custom-scanner';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { SheetInterpretation } from '@votingworks/types';
import {
  getFeatureFlagMock,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import {
  configureApp,
  waitForStatus,
  expectStatus,
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
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_CUSTOM_SCANNER
  );
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_SCAN_SHOESHINE_MODE
  );
});

test('shoeshine mode scans the same ballot repeatedly', async () => {
  await withApp(async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
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
    const ballotsCounted = 1;
    await expectStatus(apiClient, {
      state: 'accepted',
      interpretation,
      ballotsCounted,
    });
    await waitForStatus(apiClient, {
      state: 'returning_to_rescan',
      ballotsCounted,
    });

    mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
    simulateScan(mockScanner, await ballotImages.completeHmpb());
    await waitForStatus(apiClient, { state: 'scanning', ballotsCounted });
    await waitForStatus(apiClient, {
      state: 'ready_to_accept',
      interpretation,
      ballotsCounted,
    });

    await apiClient.acceptBallot();
    await expectStatus(apiClient, {
      state: 'accepted',
      interpretation,
      ballotsCounted: 2,
    });
  });
});
