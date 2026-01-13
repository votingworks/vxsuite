import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionPackage,
  SheetInterpretation,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  ballotImages,
  simulateScan,
  withApp,
} from '../test/helpers/scanner_helpers';
import { configureApp, waitForStatus } from '../test/helpers/shared_helpers';
import { delays } from './scanner';

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

const electionPackage: ElectionPackage = {
  electionDefinition: vxFamousNamesFixtures.electionDefinition,
  systemSettings: {
    ...DEFAULT_SYSTEM_SETTINGS,
    precinctScanEnableShoeshineMode: true,
  },
};

test('shoeshine mode scans the same ballot repeatedly', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        electionPackage,
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalled();

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.completeHmpb()
      );

      const interpretation: SheetInterpretation = { type: 'ValidSheet' };
      let ballotsCounted = 1;
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted,
      });
      expect(mockScanner.client.ejectDocument).not.toHaveBeenCalled();

      await apiClient.readyForNextBallot();
      await waitForStatus(apiClient, {
        state: 'accepted',
        ballotsCounted: 1,
      });
      expect(mockScanner.client.ejectDocument).toHaveBeenCalledWith(
        'toFrontAndRescan'
      );

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.completeHmpb(),
        ballotsCounted
      );
      ballotsCounted = 2;
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted,
      });
    }
  );
});

test('handles error on eject for rescan', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        electionPackage,
      });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalled();

      await simulateScan(
        apiClient,
        mockScanner,
        await ballotImages.completeHmpb()
      );

      const interpretation: SheetInterpretation = { type: 'ValidSheet' };
      const ballotsCounted = 1;
      await waitForStatus(apiClient, {
        state: 'accepted',
        interpretation,
        ballotsCounted,
      });
      expect(mockScanner.client.ejectDocument).not.toHaveBeenCalled();

      mockScanner.client.ejectDocument.mockRejectedValue(
        new Error('eject failed')
      );
      await apiClient.readyForNextBallot();
      await waitForStatus(apiClient, {
        state: 'unrecoverable_error',
        ballotsCounted: 1,
      });
    }
  );
});
