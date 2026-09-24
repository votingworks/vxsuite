import { MockInstance, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PrintJobStatus } from '@votingworks/types';
import {
  MemoryPrinterHandler,
  createMockPrinterHandler,
} from './mocks/memory_printer.js';
import {
  JOB_SETTLEMENT_POLL_INTERVAL_MS,
  awaitJobSettlement,
} from './await_job_settlement.js';

const JOB_ID = 1;

let mockPrinterHandler: MemoryPrinterHandler;
let clearJobQueue: MockInstance<() => Promise<void>>;
let onSettled: (status: PrintJobStatus) => Promise<void>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  mockPrinterHandler = createMockPrinterHandler();
  clearJobQueue = vi.spyOn(mockPrinterHandler.printer, 'clearJobQueue');
  onSettled = vi.fn(() => Promise.resolve());
});

afterEach(() => {
  vi.useRealTimers();
});

function start() {
  return awaitJobSettlement({
    jobId: JOB_ID,
    printer: mockPrinterHandler.printer,
    onSettled,
  });
}

async function advancePolls(count = 1): Promise<void> {
  await vi.advanceTimersByTimeAsync(JOB_SETTLEMENT_POLL_INTERVAL_MS * count);
}

test('waits while the job is in progress', async () => {
  mockPrinterHandler.setJobStatus(JOB_ID, { outcome: 'in-progress' });
  start();

  await advancePolls(3);

  expect(onSettled).not.toHaveBeenCalled();
  expect(clearJobQueue).not.toHaveBeenCalled();
});

test('settles once the job reaches the printer', async () => {
  mockPrinterHandler.setJobStatus(JOB_ID, { outcome: 'sent-to-printer' });
  start();

  await advancePolls();

  expect(onSettled).toHaveBeenCalledTimes(1);
  expect(onSettled).toHaveBeenCalledWith({ outcome: 'sent-to-printer' });
  expect(clearJobQueue).not.toHaveBeenCalled();
});

test('settling a failed job results in queue cleared', async () => {
  const status: PrintJobStatus = {
    outcome: 'failed',
    reason: 'Unable to send data to printer.',
  };
  mockPrinterHandler.setJobStatus(JOB_ID, status);
  start();

  await advancePolls();

  expect(clearJobQueue).toHaveBeenCalledTimes(1);
  expect(onSettled).toHaveBeenCalledWith(status);
  expect(clearJobQueue.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(onSettled).mock.invocationCallOrder[0]
  );
});

test('gives up when the job is no longer tracked', async () => {
  // No status is tracked for this job, as happens once its status is discarded
  const getJobStatus = vi.spyOn(mockPrinterHandler.printer, 'getJobStatus');
  start();

  // Polled once, found no status, and stopped
  await advancePolls(3);
  expect(getJobStatus).toHaveBeenCalledTimes(1);
  expect(onSettled).not.toHaveBeenCalled();

  // No further action even when the job status changes because
  // the monitor already gave up
  mockPrinterHandler.setJobStatus(JOB_ID, { outcome: 'sent-to-printer' });
  await advancePolls(3);
  expect(getJobStatus).toHaveBeenCalledTimes(1);
  expect(onSettled).not.toHaveBeenCalled();
});

test('stop() halts polling without settling', async () => {
  mockPrinterHandler.setJobStatus(JOB_ID, { outcome: 'sent-to-printer' });
  const monitor = start();

  monitor.stop();
  await advancePolls(3);

  expect(onSettled).not.toHaveBeenCalled();
  expect(clearJobQueue).not.toHaveBeenCalled();
});
