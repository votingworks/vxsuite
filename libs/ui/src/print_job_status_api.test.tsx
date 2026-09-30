import { beforeEach, describe, expect, type Mocked, test, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { err, ok } from '@votingworks/basics';
import {
  createPrintJobStatusApi,
  getPrintJobDisplayStatus,
  type PrintJobStatusApiClient,
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

describe('getPrintJobDisplayStatus', () => {
  test('treats a missing result as still in progress', () => {
    expect(getPrintJobDisplayStatus(undefined)).toEqual({
      outcome: 'in-progress',
    });
  });

  test('treats an error as a failure, with no reason to show', () => {
    expect(getPrintJobDisplayStatus(err(new Error('test error')))).toEqual({
      outcome: 'failed',
    });
  });

  test('passes through the status the backend gave', () => {
    expect(
      getPrintJobDisplayStatus(ok({ outcome: 'sent-to-printer' }))
    ).toEqual({ outcome: 'sent-to-printer' });
    expect(
      getPrintJobDisplayStatus(ok({ outcome: 'failed', reason: 'No paper.' }))
    ).toEqual({ outcome: 'failed', reason: 'No paper.' });
  });
});

describe('createPrintJobStatusApi', () => {
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
