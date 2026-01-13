import { beforeEach, expect, test, vi } from 'vitest';
import {
  getFeatureFlagMock,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import {
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { Result, deferred } from '@votingworks/basics';
import { ScannerError } from '@votingworks/pdi-scanner';
import { configureApp, waitForStatus } from '../test/helpers/shared_helpers';
import { withApp } from '../test/helpers/scanner_helpers';
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

test('calibrate image sensors', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      // Insert system administrator card
      vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockSystemAdministratorUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });

      // Scanning should be paused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });

      // Initiate image sensor calibration
      await apiClient.beginImageSensorCalibration();
      await waitForStatus(apiClient, {
        state: 'calibrating_image_sensors.calibrating',
      });
      expect(mockScanner.client.calibrateImageSensors).toHaveBeenCalledTimes(1);

      // Simulate insert of blank sheet
      mockScanner.emitEvent({ event: 'imageSensorCalibrationComplete' });
      await waitForStatus(apiClient, {
        state: 'calibrating_image_sensors.done',
      });

      // End image sensor calibration
      await apiClient.endImageSensorCalibration();
      await waitForStatus(apiClient, { state: 'paused' });
    }
  );
});

test('calibration time out', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      // Insert system administrator card
      vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockSystemAdministratorUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });

      // Scanning should be paused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });

      // Initiate image sensor calibration
      await apiClient.beginImageSensorCalibration();
      await waitForStatus(apiClient, {
        state: 'calibrating_image_sensors.calibrating',
      });
      expect(mockScanner.client.calibrateImageSensors).toHaveBeenCalledTimes(1);

      // Simulate PDI scanner timeout
      mockScanner.emitEvent({
        event: 'imageSensorCalibrationFailed',
        error: 'calibrationTimeoutError',
      });
      await waitForStatus(apiClient, {
        state: 'calibrating_image_sensors.done',
        error: 'image_sensor_calibration_timed_out',
      });

      // End image sensor calibration
      await apiClient.endImageSensorCalibration();
      await waitForStatus(apiClient, { state: 'paused' });
    }
  );
});

test('calibration failure', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      // Insert system administrator card
      vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockSystemAdministratorUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });

      // Scanning should be paused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });

      // Initiate image sensor calibration
      await apiClient.beginImageSensorCalibration();
      await waitForStatus(apiClient, {
        state: 'calibrating_image_sensors.calibrating',
      });
      expect(mockScanner.client.calibrateImageSensors).toHaveBeenCalledTimes(1);

      // Simulate PDI scanner timeout
      mockScanner.emitEvent({
        event: 'imageSensorCalibrationFailed',
        error: 'someOtherErrorCode',
      });
      await waitForStatus(apiClient, {
        state: 'calibrating_image_sensors.done',
        error: 'image_sensor_calibration_failed',
      });

      // End image sensor calibration
      await apiClient.endImageSensorCalibration();
      await waitForStatus(apiClient, { state: 'paused' });
    }
  );
});

test('error with calibration command', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      // Insert system administrator card
      vi.mocked(mockAuth.getAuthStatus).mockResolvedValue({
        status: 'logged_in',
        user: mockSystemAdministratorUser(),
        sessionExpiresAt: mockSessionExpiresAt(),
      });

      // Scanning should be paused
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'paused' });

      // We haven't seen this happen in practice, but we cover it just in case
      mockScanner.client.calibrateImageSensors.mockRejectedValue(
        new Error('some error')
      );
      const deferredConnect = deferred<Result<void, ScannerError>>();
      mockScanner.client.connect.mockReturnValueOnce(deferredConnect.promise);

      // Initiate image sensor calibration
      await apiClient.beginImageSensorCalibration();
      await waitForStatus(apiClient, {
        state: 'unrecoverable_error',
      });
    }
  );
});
