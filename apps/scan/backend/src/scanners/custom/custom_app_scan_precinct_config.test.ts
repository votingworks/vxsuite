import { ok } from '@votingworks/basics';
import { mocks } from '@votingworks/custom-scanner';
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
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_CUSTOM_SCANNER
  );
});

test('bmd ballot is rejected when scanned for wrong precinct', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      // Ballot should be rejected when configured for the wrong precinct
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        precinctId: '22',
        testMode: true,
      });

      const interpretation: SheetInterpretation = {
        type: 'InvalidSheet',
        reason: 'invalid_precinct',
      };

      simulateScan(mockScanner, await ballotImages.completeBmd(), clock);

      await waitForStatus(apiClient, {
        state: 'rejecting',
        interpretation,
      });
      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, {
        state: 'rejected',
        interpretation,
      });

      mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
      clock.increment(delays.DELAY_PAPER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
    }
  );
});

test('bmd ballot is accepted if precinct is set for the right precinct', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      // Configure for the proper precinct and verify the ballot scans
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        precinctId: '23',
        testMode: true,
      });

      const validInterpretation: SheetInterpretation = {
        type: 'ValidSheet',
      };

      simulateScan(mockScanner, await ballotImages.completeBmd(), clock);

      await waitForStatus(apiClient, {
        state: 'accepting',
        interpretation: validInterpretation,
      });
    }
  );
});
