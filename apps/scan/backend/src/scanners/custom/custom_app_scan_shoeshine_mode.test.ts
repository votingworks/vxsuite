import { ok } from '@votingworks/basics';
import { mocks } from '@votingworks/custom-scanner';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SheetInterpretation,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { beforeEach, test, vi } from 'vitest';
import {
  ballotImages,
  simulateScan,
  withApp,
} from '../../../test/helpers/custom_helpers';
import {
  configureApp,
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
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_CUSTOM_SCANNER
  );
});

test('shoeshine mode scans the same ballot repeatedly', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        electionPackage: {
          electionDefinition: vxFamousNamesFixtures.electionDefinition,
          systemSettings: {
            ...DEFAULT_SYSTEM_SETTINGS,
            precinctScanEnableShoeshineMode: true,
          },
        },
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));

      const interpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      simulateScan(mockScanner, await ballotImages.completeHmpb(), clock);
      const ballotsCounted = 1;
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted,
      });
      clock.increment(delays.DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT);
      await waitForStatus(apiClient, {
        state: 'returning_to_rescan',
        ballotsCounted,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      simulateScan(mockScanner, await ballotImages.completeHmpb(), clock);
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted: 2,
      });
    }
  );
});
