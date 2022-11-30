import { renderHook } from '@testing-library/react-hooks';
import { Scan } from '@votingworks/api';
import { sleep } from '@votingworks/utils';
import fetchMock, { MockResponseFunction } from 'fetch-mock';
import { advanceTimersAndPromises } from '@votingworks/test-utils';
import { usePrecinctScannerStatus } from './use_precinct_scanner_status';

const statusNoPaper: Scan.GetPrecinctScannerStatusResponse = {
  state: 'no_paper',
  ballotsCounted: 0,
  canUnconfigure: false,
};

const statusReadyToScan: Scan.GetPrecinctScannerStatusResponse = {
  state: 'ready_to_scan',
  ballotsCounted: 0,
  canUnconfigure: false,
};

beforeEach(() => {
  jest.useFakeTimers();
});

test('initial state', () => {
  const { result } = renderHook(() => usePrecinctScannerStatus());
  expect(result.current).toBeUndefined();
});

test('updates from /scanner/status', async () => {
  const { result } = renderHook(() => usePrecinctScannerStatus());

  // first update
  fetchMock.getOnce('/precinct-scanner/scanner/status', {
    body: statusNoPaper,
  });
  await advanceTimersAndPromises(1);
  expect(result.current?.state).toBe('no_paper');

  // second update
  fetchMock.getOnce(
    '/precinct-scanner/scanner/status',
    { body: statusReadyToScan },
    { overwriteRoutes: false }
  );
  await advanceTimersAndPromises(1);
  expect(result.current?.state).toBe('ready_to_scan');
});

test('disabling', async () => {
  const { result } = renderHook(() => usePrecinctScannerStatus(false));

  fetchMock.getOnce('/precinct-scanner/scanner/status', {
    body: statusNoPaper,
  });
  await advanceTimersAndPromises(100);

  expect(result.current).toBeUndefined();
});

test('issues one status check at a time', async () => {
  const statusEndpoint = jest.fn<
    ReturnType<MockResponseFunction>,
    Parameters<MockResponseFunction>
  >(async () => {
    await sleep(5);
    return new Response(JSON.stringify(statusNoPaper), {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const { result } = renderHook(() => usePrecinctScannerStatus());

  fetchMock.get('/precinct-scanner/scanner/status', statusEndpoint);
  expect(result.current).toBeUndefined();

  await advanceTimersAndPromises(6);
  expect(result.current).toMatchObject({ state: 'no_paper' });

  await advanceTimersAndPromises(6);
  expect(statusEndpoint.mock.calls.length).toEqual(2);
});
