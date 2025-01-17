import { beforeEach, expect, test, vi } from 'vitest';
import {
  getFeatureFlagMock,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import {
  mockElectionManagerUser,
  mockOf,
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { withApp } from '../../../test/helpers/pdi_helpers';
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
});

test('if election manager card inserted, scanning paused', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalled();

      // Insert election manager card
      mockOf(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockElectionManagerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });

      // Scanning should be paused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });
      expect(mockScanner.client.disableScanning).toHaveBeenCalled();

      // Remove the card
      mockOf(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_out',
        reason: 'no_card',
      });

      // Scanning should be unpaused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalled();
    }
  );
});

test('if poll worker card inserted, scanning paused', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalled();

      // Insert poll worker card
      mockOf(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockPollWorkerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });

      // Scanning should be paused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });
      expect(mockScanner.client.disableScanning).toHaveBeenCalled();

      // Remove the card
      mockOf(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_out',
        reason: 'no_card',
      });

      // Scanning should be unpaused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'no_paper' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalled();
    }
  );
});
