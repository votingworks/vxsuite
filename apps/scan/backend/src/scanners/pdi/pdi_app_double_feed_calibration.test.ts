import { beforeEach, expect, test, vi } from 'vitest';
import {
  getFeatureFlagMock,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import {
  mockOf,
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { Result, deferred } from '@votingworks/basics';
import { ScannerError } from '@votingworks/pdi-scanner';
import {
  configureApp,
  waitForStatus,
} from '../../../test/helpers/shared_helpers';
import { withApp } from '../../../test/helpers/pdi_helpers';
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

test('calibrate double feed detection', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      // Insert election manager card
      mockOf(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockElectionManagerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });

      // Scanning should be paused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });

      // Initiate double feed calibration
      await apiClient.beginDoubleFeedCalibration();
      await waitForStatus(apiClient, {
        state: 'calibrating_double_feed_detection.double_sheet',
      });
      expect(
        mockScanner.client.calibrateDoubleFeedDetection
      ).toHaveBeenLastCalledWith('double');

      // Simulate insert of double sheet
      mockScanner.emitEvent({ event: 'doubleFeedCalibrationComplete' });
      await waitForStatus(apiClient, {
        state: 'calibrating_double_feed_detection.single_sheet',
      });
      expect(
        mockScanner.client.calibrateDoubleFeedDetection
      ).toHaveBeenLastCalledWith('single');

      // Simulate insert of single sheet
      mockScanner.emitEvent({ event: 'doubleFeedCalibrationComplete' });
      await waitForStatus(apiClient, {
        state: 'calibrating_double_feed_detection.done',
      });

      // End double feed calibration
      await apiClient.endDoubleFeedCalibration();
      await waitForStatus(apiClient, { state: 'paused' });
    }
  );
});

test('calibration time out waiting for double sheet', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      // Insert election manager card
      mockOf(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockElectionManagerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });

      // Scanning should be paused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });

      // Initiate double feed calibration
      await apiClient.beginDoubleFeedCalibration();
      await waitForStatus(apiClient, {
        state: 'calibrating_double_feed_detection.double_sheet',
      });

      // Simulate PDI scanner timeout
      mockScanner.emitEvent({ event: 'doubleFeedCalibrationTimedOut' });
      await waitForStatus(apiClient, {
        state: 'calibrating_double_feed_detection.done',
        error: 'double_feed_calibration_timed_out',
      });

      // End double feed calibration
      await apiClient.endDoubleFeedCalibration();
      await waitForStatus(apiClient, { state: 'paused' });
    }
  );
});

test('calibration time out waiting for single sheet', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      // Insert election manager card
      mockOf(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockElectionManagerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });

      // Scanning should be paused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });

      // Initiate double feed calibration
      await apiClient.beginDoubleFeedCalibration();
      await waitForStatus(apiClient, {
        state: 'calibrating_double_feed_detection.double_sheet',
      });

      // Simulate insert of double sheet
      mockScanner.emitEvent({ event: 'doubleFeedCalibrationComplete' });
      await waitForStatus(apiClient, {
        state: 'calibrating_double_feed_detection.single_sheet',
      });

      // Simulate PDI scanner timeout
      mockScanner.emitEvent({ event: 'doubleFeedCalibrationTimedOut' });
      await waitForStatus(apiClient, {
        state: 'calibrating_double_feed_detection.done',
        error: 'double_feed_calibration_timed_out',
      });

      // End double feed calibration
      await apiClient.endDoubleFeedCalibration();
      await waitForStatus(apiClient, { state: 'paused' });
    }
  );
});

test('error with calibration command for double sheet', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockOf(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockElectionManagerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });

      // We haven't seen this happen in practice, but we cover it just in case
      mockScanner.client.calibrateDoubleFeedDetection.mockRejectedValue(
        new Error('some error')
      );
      const deferredConnect = deferred<Result<void, ScannerError>>();
      mockScanner.client.connect.mockReturnValueOnce(deferredConnect.promise);

      await apiClient.beginDoubleFeedCalibration();
      await waitForStatus(apiClient, {
        state: 'unrecoverable_error',
      });
    }
  );
});

test('error with calibration command for single sheet', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      mockOf(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockElectionManagerUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });

      // Initiate double feed calibration
      await apiClient.beginDoubleFeedCalibration();
      await waitForStatus(apiClient, {
        state: 'calibrating_double_feed_detection.double_sheet',
      });

      mockScanner.client.calibrateDoubleFeedDetection.mockRejectedValue(
        new Error('some error')
      );
      const deferredConnect = deferred<Result<void, ScannerError>>();
      mockScanner.client.connect.mockReturnValueOnce(deferredConnect.promise);

      // Simulate insert of double sheet
      mockScanner.emitEvent({ event: 'doubleFeedCalibrationComplete' });
      await waitForStatus(apiClient, {
        state: 'unrecoverable_error',
      });
    }
  );
});
