import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { withApp } from '../test/helpers/scanner_helpers.js';
import { configureApp, waitForStatus } from '../test/helpers/shared_helpers.js';
import { delays } from './scanner.js';

vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  vi.stubEnv(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION,
    'TRUE'
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});
test('if election manager card inserted, scanning paused', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalled();

      // Insert election manager card
      vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockElectionManagerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });

      // Scanning should be paused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });
      expect(mockScanner.client.disableScanning).toHaveBeenCalled();

      // Remove the card
      vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_out',
        reason: 'no_card',
      });

      // Scanning should be unpaused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalled();
    }
  );
});

test('if poll worker card inserted, scanning paused', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalled();

      // Insert poll worker card
      vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockPollWorkerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });

      // Scanning should be paused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });
      expect(mockScanner.client.disableScanning).toHaveBeenCalled();

      // Remove the card
      vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_out',
        reason: 'no_card',
      });

      // Scanning should be unpaused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalled();
    }
  );
});
