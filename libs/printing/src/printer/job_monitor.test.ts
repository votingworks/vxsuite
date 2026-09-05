import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { deferred, err, ok } from '@votingworks/basics';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { PrintJobId, PrintJobStatus } from '@votingworks/types';
import {
  JOB_POLL_INTERVAL,
  MAX_CONSECUTIVE_QUERY_FAILURES,
  startPrintJobMonitor,
} from './job_monitor';
import { queryJobStatus } from './job_status';

vi.mock(import('./job_status.js'), async (importActual) => ({
  ...(await importActual()),
  queryJobStatus: vi.fn(),
}));

const queryJobStatusMock = vi.mocked(queryJobStatus);

const JOB_ID: PrintJobId = 42;
const POLL_INTERVAL = 500;
const JOB_TIMEOUT = 10_000;
const RETENTION = 5_000;

let jobs: Map<PrintJobId, PrintJobStatus>;
let logger: ReturnType<typeof mockBaseLogger>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  jobs = new Map();
  logger = mockBaseLogger({ fn: vi.fn });
});

afterEach(() => {
  vi.useRealTimers();
});

function start() {
  return startPrintJobMonitor(
    { jobId: JOB_ID, jobs, logger },
    {
      pollInterval: POLL_INTERVAL,
      jobTimeout: JOB_TIMEOUT,
      retention: RETENTION,
    }
  );
}

/**
 * The async variant is required so the awaited query settles inside the tick.
 */
async function advancePolls(count = 1): Promise<void> {
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL * count);
}

test('records the job as in progress before the first poll', () => {
  start();
  expect(jobs.get(JOB_ID)).toEqual({ outcome: 'in-progress' });
  expect(queryJobStatusMock).not.toHaveBeenCalled();
});

test('stays in progress while CUPS reports the job in progress', async () => {
  queryJobStatusMock.mockResolvedValue(ok({ outcome: 'in-progress' }));
  start();

  await advancePolls(3);

  expect(queryJobStatusMock).toHaveBeenCalledTimes(3);
  expect(jobs.get(JOB_ID)).toEqual({ outcome: 'in-progress' });
  expect(logger.log).not.toHaveBeenCalled();
});

test('finishes and stops polling when the job is sent to the printer', async () => {
  queryJobStatusMock.mockResolvedValue(ok({ outcome: 'sent-to-printer' }));
  start();

  await advancePolls();

  expect(jobs.get(JOB_ID)).toEqual({ outcome: 'sent-to-printer' });
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PrinterPrintComplete,
    'system',
    {
      message: 'CUPS finished sending the print job to the printer.',
      disposition: 'success',
      jobId: JOB_ID,
    }
  );

  // polling stopped
  await advancePolls(3);
  expect(queryJobStatusMock).toHaveBeenCalledTimes(1);
});

test('reports the diagnostic message when the job fails', async () => {
  queryJobStatusMock.mockResolvedValue(
    ok({ outcome: 'failed', reason: 'Unable to send data to printer.' })
  );
  start();

  await advancePolls();

  expect(jobs.get(JOB_ID)).toEqual({
    outcome: 'failed',
    reason: 'Unable to send data to printer.',
  });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PrinterPrintComplete,
    'system',
    {
      message: 'CUPS did not send the print job to the printer.',
      disposition: 'failure',
      jobId: JOB_ID,
      reason: 'Unable to send data to printer.',
    }
  );
});

test('fails immediately when CUPS has no record of the job', async () => {
  queryJobStatusMock.mockResolvedValue(
    err({ type: 'unknown-job', message: 'CUPS did not return job 42' })
  );
  start();

  await advancePolls();

  expect(jobs.get(JOB_ID)).toEqual({
    outcome: 'failed',
    reason: 'CUPS no longer has a record of this print job.',
  });
});

test('retries a failed query and recovers', async () => {
  queryJobStatusMock
    .mockResolvedValueOnce(err({ type: 'query-failed', message: 'boom' }))
    .mockResolvedValue(ok({ outcome: 'sent-to-printer' }));
  start();

  await advancePolls();
  expect(jobs.get(JOB_ID)).toEqual({ outcome: 'in-progress' });

  await advancePolls();
  expect(jobs.get(JOB_ID)).toEqual({ outcome: 'sent-to-printer' });
});

test('fails after consecutive query failures', async () => {
  queryJobStatusMock.mockResolvedValue(
    err({ type: 'query-failed', message: 'connection refused' })
  );
  start();

  await advancePolls(MAX_CONSECUTIVE_QUERY_FAILURES - 1);
  expect(jobs.get(JOB_ID)).toEqual({ outcome: 'in-progress' });

  await advancePolls();
  expect(jobs.get(JOB_ID)).toEqual({
    outcome: 'failed',
    reason: 'Unable to reach CUPS for print job status: connection refused',
  });
});

test('resets the failure count after a successful query', async () => {
  queryJobStatusMock
    .mockResolvedValueOnce(err({ type: 'query-failed', message: 'boom' }))
    .mockResolvedValueOnce(err({ type: 'query-failed', message: 'boom' }))
    .mockResolvedValueOnce(ok({ outcome: 'in-progress' }))
    .mockResolvedValue(err({ type: 'query-failed', message: 'boom' }));
  start();

  // two failures, then a success, then two more failures: never three in a row
  await advancePolls(5);
  expect(jobs.get(JOB_ID)).toEqual({ outcome: 'in-progress' });
});

test('treats an unparseable response as a failed query', async () => {
  queryJobStatusMock.mockRejectedValue(new Error('Unable to parse ipptool'));
  start();

  await advancePolls(MAX_CONSECUTIVE_QUERY_FAILURES);

  expect(jobs.get(JOB_ID)).toEqual({
    outcome: 'failed',
    reason:
      'Unable to reach CUPS for print job status: Unable to parse ipptool',
  });
});

test('an unparseable response after the timeout is ignored', async () => {
  const query = deferred<Awaited<ReturnType<typeof queryJobStatus>>>();
  queryJobStatusMock.mockReturnValue(query.promise);
  start();

  await advancePolls();
  await vi.advanceTimersByTimeAsync(JOB_TIMEOUT);

  query.reject(new Error('Unable to parse ipptool'));
  await vi.advanceTimersByTimeAsync(0);

  expect(jobs.get(JOB_ID)).toEqual({
    outcome: 'failed',
    reason: `Print job did not reach a terminal state within ${JOB_TIMEOUT}ms.`,
  });
  expect(logger.log).toHaveBeenCalledTimes(1);
});

test('fails the job if it never reaches a terminal state', async () => {
  queryJobStatusMock.mockResolvedValue(ok({ outcome: 'in-progress' }));
  start();

  await vi.advanceTimersByTimeAsync(JOB_TIMEOUT);

  expect(jobs.get(JOB_ID)).toEqual({
    outcome: 'failed',
    reason: `Print job did not reach a terminal state within ${JOB_TIMEOUT}ms.`,
  });
  expect(logger.log).toHaveBeenCalledTimes(1);
});

test('a query that resolves after the timeout does not overwrite the outcome', async () => {
  const query = deferred<Awaited<ReturnType<typeof queryJobStatus>>>();
  queryJobStatusMock.mockReturnValue(query.promise);
  start();

  // start a poll, then let the timeout fire while it is still in flight
  await advancePolls();
  await vi.advanceTimersByTimeAsync(JOB_TIMEOUT);
  expect(jobs.get(JOB_ID)?.outcome).toEqual('failed');

  query.resolve(ok({ outcome: 'sent-to-printer' }));
  await vi.advanceTimersByTimeAsync(0);

  expect(jobs.get(JOB_ID)?.outcome).toEqual('failed');
  expect(logger.log).toHaveBeenCalledTimes(1);
});

test('a query slower than the poll interval does not run concurrently', async () => {
  const query = deferred<Awaited<ReturnType<typeof queryJobStatus>>>();
  queryJobStatusMock.mockReturnValue(query.promise);
  start();

  await advancePolls(3);
  expect(queryJobStatusMock).toHaveBeenCalledTimes(1);

  query.resolve(ok({ outcome: 'in-progress' }));
  await vi.advanceTimersByTimeAsync(0);

  await advancePolls();
  expect(queryJobStatusMock).toHaveBeenCalledTimes(2);
});

test('forgets the job after the retention window', async () => {
  queryJobStatusMock.mockResolvedValue(ok({ outcome: 'sent-to-printer' }));
  start();

  await advancePolls();
  expect(jobs.has(JOB_ID)).toEqual(true);

  await vi.advanceTimersByTimeAsync(RETENTION - 1);
  expect(jobs.has(JOB_ID)).toEqual(true);

  await vi.advanceTimersByTimeAsync(1);
  expect(jobs.has(JOB_ID)).toEqual(false);
});

test('polls on the default schedule when no options are given', async () => {
  queryJobStatusMock.mockResolvedValue(ok({ outcome: 'in-progress' }));
  const monitor = startPrintJobMonitor({ jobId: JOB_ID, jobs, logger });

  expect(jobs.get(JOB_ID)).toEqual({ outcome: 'in-progress' });

  await vi.advanceTimersByTimeAsync(JOB_POLL_INTERVAL);
  expect(queryJobStatusMock).toHaveBeenCalledTimes(1);

  monitor.stop();
});

test('stop() halts polling without recording an outcome', async () => {
  queryJobStatusMock.mockResolvedValue(ok({ outcome: 'sent-to-printer' }));
  const monitor = start();

  monitor.stop();
  await advancePolls(3);

  expect(queryJobStatusMock).not.toHaveBeenCalled();
  expect(jobs.get(JOB_ID)).toEqual({ outcome: 'in-progress' });
  expect(logger.log).not.toHaveBeenCalled();
});
