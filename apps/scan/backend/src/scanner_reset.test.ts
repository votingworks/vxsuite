import { deferred, err, ok, Result } from '@votingworks/basics';
import { mockScannerStatus, ScannerError } from '@votingworks/pdi-scanner';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import { afterEach, beforeEach, test, vi } from 'vitest';
import {
  ballotImages,
  withApp,
  MockPdiScannerClient,
} from '../test/helpers/scanner_helpers.js';
import { configureApp, waitForStatus } from '../test/helpers/shared_helpers.js';
import { delays, RESET_COOLDOWN_MS } from './scanner.js';
import { getCurrentTime } from './util/get_current_time.js';

vi.setConfig({ testTimeout: 20_000 });

vi.mock(import('./util/get_current_time.js'));

beforeEach(() => {
  vi.stubEnv(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION,
    'TRUE'
  );
  vi.mocked(getCurrentTime).mockReturnValue(Date.now());
});

afterEach(() => {
  vi.unstubAllEnvs();
});
function simulateNonDisconnectError(mockScanner: MockPdiScannerClient) {
  mockScanner.emitEvent({
    event: 'error',
    code: 'other',
    message: 'nusb error: Protocol error (os error 71)',
  });
}

function mockResetSuccess(mockScanner: MockPdiScannerClient) {
  mockScanner.client.connect.mockResolvedValueOnce(ok());
  mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
}

test('auto-resets on non-disconnect error and recovers', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });

      mockResetSuccess(mockScanner);
      simulateNonDisconnectError(mockScanner);

      // Should auto-reset and return to waiting_for_ballot
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
    }
  );
});

test('goes to unrecoverable_error if reset connect fails', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });

      mockScanner.client.connect.mockResolvedValueOnce(
        err({ code: 'other', message: 'still broken' })
      );
      simulateNonDisconnectError(mockScanner);

      await waitForStatus(apiClient, { state: 'unrecoverable_error' });
    }
  );
});

test('goes to unrecoverable_error if error recurs within cooldown', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });

      // First error: should auto-reset
      mockResetSuccess(mockScanner);
      simulateNonDisconnectError(mockScanner);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });

      // Second error within cooldown: should go to unrecoverable_error
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
      simulateNonDisconnectError(mockScanner);
      await waitForStatus(apiClient, { state: 'unrecoverable_error' });
    }
  );
});

test('scanner event during reset is ignored', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });

      const deferredConnect = deferred<Result<void, ScannerError>>();
      mockScanner.client.connect.mockReturnValueOnce(deferredConnect.promise);
      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
      simulateNonDisconnectError(mockScanner);

      await waitForStatus(apiClient, { state: 'resetting' });
      mockScanner.emitEvent({
        event: 'scanComplete',
        images: await ballotImages.blankSheet(),
      });
      deferredConnect.resolve(ok());

      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
    }
  );
});

test('scanner error during reset is ignored', async () => {
  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });

      const deferredConnect = deferred<Result<void, ScannerError>>();
      mockScanner.client.connect.mockReturnValueOnce(deferredConnect.promise);
      mockScanner.setScannerStatus(mockScannerStatus.idleScanningDisabled);
      simulateNonDisconnectError(mockScanner);

      await waitForStatus(apiClient, { state: 'resetting' });
      mockScanner.emitEvent({
        event: 'error',
        code: 'scanFailed',
      });
      deferredConnect.resolve(ok());

      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
    }
  );
});

test('allows reset again after cooldown period', async () => {
  const now = Date.now();
  vi.mocked(getCurrentTime).mockReturnValue(now);

  await withApp(
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, clock }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive);

      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });

      // First error: should auto-reset
      mockResetSuccess(mockScanner);
      simulateNonDisconnectError(mockScanner);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });

      // Advance past cooldown
      vi.mocked(getCurrentTime).mockReturnValue(now + RESET_COOLDOWN_MS + 1);

      // Second error after cooldown: should auto-reset again
      clock.increment(delays.DELAY_SCANNING_ENABLED_POLLING_INTERVAL);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
      mockResetSuccess(mockScanner);
      simulateNonDisconnectError(mockScanner);
      await waitForStatus(apiClient, { state: 'waiting_for_ballot' });
    }
  );
});
