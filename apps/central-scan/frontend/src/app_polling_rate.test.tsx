import { afterEach, beforeEach, expect, test, vi, Mock } from 'vitest';
import { AUTH_STATUS_POLLING_INTERVAL_MS } from '@votingworks/ui';
import { act, render, screen } from '../test/react_testing_library.js';
import { App } from './app.js';
import { ApiMock, createApiMock } from '../test/api.js';
import { mockStatus } from '../test/fixtures.js';
import { STATUS_POLLING_INTERVAL_MS } from './api.js';

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
  vi.restoreAllMocks();
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
  const getStatus = vi.fn(() => Promise.resolve(mockStatus()));
  (apiMock.apiClient.getStatus as unknown as Mock) = getStatus;
  const getUsbDriveStatus = vi.fn(() =>
    Promise.resolve({ status: 'no_drive' })
  );
  (apiMock.apiClient.getUsbDriveStatus as unknown as Mock) = getUsbDriveStatus;

  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetTestMode(false);
  apiMock.expectGetPollingPlaceId();

  render(<App apiClient={apiMock.apiClient} />);
  await screen.findByText(
    'Insert an election manager card to configure VxCentralScan'
  );

  // At the locked screen, two always-mounted components subscribe to the
  // auth status query (AppRoot and SessionTimeLimitTracker), and AppRoot
  // subscribes to the scanner and USB drive status queries.
  const authCallsBefore = getAuthStatus.mock.calls.length;
  const statusCallsBefore = getStatus.mock.calls.length;
  const usbCallsBefore = getUsbDriveStatus.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(MEASUREMENT_WINDOW_MS));
  const authCalls = getAuthStatus.mock.calls.length - authCallsBefore;
  const statusCalls = getStatus.mock.calls.length - statusCallsBefore;
  const usbCalls = getUsbDriveStatus.mock.calls.length - usbCallsBefore;

  const expectedAuthCalls =
    MEASUREMENT_WINDOW_MS / AUTH_STATUS_POLLING_INTERVAL_MS;
  expect(authCalls).toBeGreaterThanOrEqual(expectedAuthCalls);
  expect(authCalls).toBeLessThanOrEqual(expectedAuthCalls * RATE_HEADROOM);

  const expectedStatusCalls =
    MEASUREMENT_WINDOW_MS / STATUS_POLLING_INTERVAL_MS;
  expect(statusCalls).toBeGreaterThanOrEqual(expectedStatusCalls);
  expect(statusCalls).toBeLessThanOrEqual(expectedStatusCalls * RATE_HEADROOM);

  expect(usbCalls).toBeGreaterThanOrEqual(expectedStatusCalls);
  expect(usbCalls).toBeLessThanOrEqual(expectedStatusCalls * RATE_HEADROOM);

  // Polled queries with no mounted subscriber are not requested at all
  expect(apiMock.apiClient.getNetworkStatus.mock.calls).toHaveLength(0);
});
