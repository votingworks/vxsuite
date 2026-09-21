import { beforeEach, describe, expect, Mocked, test, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { err, ok } from '@votingworks/basics';
import {
  createPrintJobStatusApi,
  getPrintOutcome,
  PrintJobStatusApiClient,
} from './print_job_status_api.js';

vi.useFakeTimers({ shouldAdvanceTime: true });

function QueryWrapper(props: { children: React.ReactNode }) {
  const { children } = props;
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

const mockApiClient: Mocked<PrintJobStatusApiClient> = {
  getPrintJobStatus: vi.fn(),
};
const api = createPrintJobStatusApi(() => mockApiClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPrintOutcome', () => {
  test('treats a missing result as still in progress', () => {
    expect(getPrintOutcome(undefined)).toEqual('in-progress');
  });

  test('treats an untrackable job as a failure', () => {
    expect(getPrintOutcome(err(new Error('no status tracked')))).toEqual(
      'failed'
    );
  });

  test('reports the outcome the backend gave', () => {
    expect(getPrintOutcome(ok({ outcome: 'sent-to-printer' }))).toEqual(
      'sent-to-printer'
    );
    expect(getPrintOutcome(ok({ outcome: 'failed' }))).toEqual('failed');
  });
});

describe('createPrintJobStatusApi', () => {
  test('keys each job separately', () => {
    expect(api.queryKey(1)).not.toEqual(api.queryKey(2));
  });

  test('does not query until there is a job to watch', () => {
    renderHook(() => api.useQuery(undefined), { wrapper: QueryWrapper });
    expect(mockApiClient.getPrintJobStatus).not.toHaveBeenCalled();
  });

  test('queries the status of the given job', async () => {
    mockApiClient.getPrintJobStatus.mockResolvedValue(
      ok({ outcome: 'sent-to-printer' })
    );

    const { result } = renderHook(() => api.useQuery(7), {
      wrapper: QueryWrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(ok({ outcome: 'sent-to-printer' }));
    });
    expect(mockApiClient.getPrintJobStatus).toHaveBeenCalledWith({ jobId: 7 });
  });

  test('keeps polling while the job is in progress', async () => {
    mockApiClient.getPrintJobStatus.mockResolvedValue(
      ok({ outcome: 'in-progress' })
    );

    renderHook(() => api.useQuery(7), { wrapper: QueryWrapper });

    await waitFor(() => {
      expect(mockApiClient.getPrintJobStatus.mock.calls.length).toBeGreaterThan(
        1
      );
    });
  });
});
