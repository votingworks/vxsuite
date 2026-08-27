import { afterEach, beforeEach, expect, test, vi, Mock } from 'vitest';
import { AUTH_STATUS_POLLING_INTERVAL_MS } from '@votingworks/ui';
import { act, screen } from '../test/react_testing_library.js';
import { buildApp } from '../test/helpers/build_app.js';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client.js';
import { PRINTER_STATUS_POLLING_INTERVAL_MS } from './api.js';

// `usePollingQuery` consolidates polling: no matter how many components
// subscribe to a polled query, exactly one refetch timer runs per query.
// This test pins the request rate of the app's polled queries with the real
// component tree mounted, so a regression that multiplies polling (e.g. a
// second observer passing a `refetchInterval`) fails loudly.

const MEASUREMENT_WINDOW_MS = 5_000;

// `shouldAdvanceTime` lets a little real time creep in alongside the fake
// clock, so allow some headroom. A duplicated timer would roughly double the
// count, far past this bound.
const RATE_HEADROOM = 1.3;

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  vi.useRealTimers();
  apiMock.assertComplete();
});

test('polled queries issue one request per interval regardless of subscriber count', async () => {
  // Replace the polled endpoints with plain vitest mocks so calls can be
  // counted (the strict grout mock does not expose call counts).
  const getAuthStatus = vi.fn(() =>
    Promise.resolve({ status: 'logged_out', reason: 'machine_locked' })
  );
  (apiMock.apiClient.getAuthStatus as unknown as Mock) = getAuthStatus;
  const getPrinterStatus = vi.fn(() => Promise.resolve({ connected: false }));
  (apiMock.apiClient.getPrinterStatus as unknown as Mock) = getPrinterStatus;
  const getNetworkStatus = vi.fn();
  (apiMock.apiClient.getNetworkStatus as unknown as Mock) = getNetworkStatus;

  apiMock.expectGetMachineConfig();
  apiMock.expectGetCurrentElectionMetadata();
  apiMock.expectGetUsbDriveStatus('no_drive');
  apiMock.expectGetSystemSettings();

  const { renderApp } = buildApp(apiMock);
  renderApp();
  await screen.findByText('VxAdmin Locked');

  // At the locked screen, three always-mounted components subscribe to the
  // auth status query (AppRoot, SessionTimeLimitTracker, and
  // PrinterAlertWrapper) and one to the printer status query
  // (PrinterAlertWrapper).
  const authCallsBefore = getAuthStatus.mock.calls.length;
  const printerCallsBefore = getPrinterStatus.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(MEASUREMENT_WINDOW_MS));
  const authCalls = getAuthStatus.mock.calls.length - authCallsBefore;
  const printerCalls = getPrinterStatus.mock.calls.length - printerCallsBefore;

  const expectedAuthCalls =
    MEASUREMENT_WINDOW_MS / AUTH_STATUS_POLLING_INTERVAL_MS;
  expect(authCalls).toBeGreaterThanOrEqual(expectedAuthCalls);
  expect(authCalls).toBeLessThanOrEqual(expectedAuthCalls * RATE_HEADROOM);

  const expectedPrinterCalls =
    MEASUREMENT_WINDOW_MS / PRINTER_STATUS_POLLING_INTERVAL_MS;
  expect(printerCalls).toBeGreaterThanOrEqual(expectedPrinterCalls);
  expect(printerCalls).toBeLessThanOrEqual(
    expectedPrinterCalls * RATE_HEADROOM
  );

  // Polled queries with no mounted subscriber are not requested at all
  expect(getNetworkStatus).not.toHaveBeenCalled();
});
