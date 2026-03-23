import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import { Result, deferred, err, ok } from '@votingworks/basics';
import { mockScannerStatus, ScannerError } from '@votingworks/pdi-scanner';
import { configureApp, waitForStatus } from '../test/helpers/shared_helpers.js';
import { delays } from './scanner.js';
import { withApp } from '../test/helpers/scanner_helpers.js';

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
test('cover open while waiting for ballots', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });

      mockScanner.client.disableScanning.mockClear();
      mockScanner.client.enableScanning.mockClear();
      mockScanner.setScannerStatus(mockScannerStatus.coverOpen);
      mockScanner.emitEvent({ event: 'coverOpen' });
      await waitForStatus(apiClient, { state: 'cover_open' });
      expect(mockScanner.client.disableScanning).toHaveBeenCalled();

      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
      mockScanner.emitEvent({ event: 'coverClosed' });
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
      expect(mockScanner.client.enableScanning).toHaveBeenCalled();
    }
  );
});

test('cover open while jammed', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });

      mockScanner.emitEvent({ event: 'scanStart' });
      await waitForStatus(apiClient, { state: 'scanning' });

      mockScanner.setScannerStatus(mockScannerStatus.jammed);
      const deferredEject = deferred<Result<void, ScannerError>>();
      mockScanner.client.ejectDocument.mockReturnValueOnce(
        deferredEject.promise
      );
      mockScanner.emitEvent({ event: 'error', code: 'scanFailed' });
      await waitForStatus(apiClient, {
        state: 'rejecting',
        error: 'scanning_failed',
      });
      deferredEject.resolve(ok());
      await waitForStatus(apiClient, {
        state: 'jammed',
        error: 'scanning_failed',
      });

      mockScanner.setScannerStatus(mockScannerStatus.jammedCoverOpen);
      mockScanner.emitEvent({ event: 'coverOpen' });
      await waitForStatus(apiClient, { state: 'cover_open' });

      mockScanner.setScannerStatus(mockScannerStatus.coverOpen);
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'cover_open' });

      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
      mockScanner.emitEvent({ event: 'coverClosed' });
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
    }
  );
});

test('coverOpen ignored in unrecoverable_error state', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });

      mockScanner.client.connect.mockResolvedValueOnce(
        err({ code: 'other', message: 'still broken' })
      );
      mockScanner.emitEvent({
        event: 'error',
        code: 'other',
        message: 'nusb error: Protocol error (os error 71)',
      });
      await waitForStatus(apiClient, { state: 'unrecoverable_error' });

      // coverOpen should NOT escape unrecoverable_error
      mockScanner.emitEvent({ event: 'coverOpen' });
      clock.increment(delays.DELAY_SCANNER_STATUS_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'unrecoverable_error' });
    }
  );
});
