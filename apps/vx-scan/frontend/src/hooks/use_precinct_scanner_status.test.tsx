import React from 'react';
import { renderHook } from '@testing-library/react-hooks';
import { deferred } from '@votingworks/utils';
import { advanceTimersAndPromises } from '@votingworks/test-utils';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { PrecinctScannerStatus } from '@votingworks/vx-scan-backend';
import { usePrecinctScannerStatus } from './use_precinct_scanner_status';
import { ApiClientContext } from '../api/api';
import {
  createApiMock,
  statusNoPaper,
} from '../../test/helpers/mock_api_client';
import { scannerStatus } from '../../test/helpers/helpers';

const apiMock = createApiMock();

beforeEach(() => {
  jest.useFakeTimers();
  apiMock.mockApiClient.reset();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function render(interval?: number | false) {
  return renderHook(() => usePrecinctScannerStatus(interval), {
    wrapper: ({ children }) => (
      <ApiClientContext.Provider value={apiMock.mockApiClient}>
        {children}
      </ApiClientContext.Provider>
    ),
  });
}

test('initial state', () => {
  const { result } = render();
  expect(result.current).toBeUndefined();
});

test('updates from /scanner/status', async () => {
  const { result } = render();

  // first update
  apiMock.expectGetScannerStatus(statusNoPaper);
  await advanceTimersAndPromises(1);
  expect(result.current?.state).toBe('no_paper');

  // second update
  apiMock.expectGetScannerStatus(scannerStatus({ state: 'ready_to_scan' }));
  await advanceTimersAndPromises(1);
  expect(result.current?.state).toBe('ready_to_scan');
});

test('disabling', async () => {
  const { result } = render(false);
  await advanceTimersAndPromises(1);
  expect(result.current).toBeUndefined();
});

test('issues one status check at a time', async () => {
  apiMock.mockApiClient.getScannerStatus
    .expectCallWith()
    .resolves(statusNoPaper);
  const { promise, resolve } = deferred<PrecinctScannerStatus>();
  apiMock.mockApiClient.getScannerStatus.expectCallWith().returns(promise);
  const { result } = render(1000);
  expect(result.current).toBeUndefined();
  await advanceTimersAndPromises(1);
  expect(result.current).toMatchObject({ state: 'no_paper' });
  await advanceTimersAndPromises(2);
  expect(result.current).toMatchObject({ state: 'no_paper' });
  resolve(scannerStatus({ state: 'ready_to_scan' }));
  await advanceTimersAndPromises(1);
  expect(result.current).toMatchObject({ state: 'ready_to_scan' });
});
