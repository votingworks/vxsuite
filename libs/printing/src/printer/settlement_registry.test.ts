import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { err, ok } from '@votingworks/basics';
import type { PrintJobStatus } from '@votingworks/types';
import { JOB_SETTLEMENT_POLL_INTERVAL_MS } from './await_job_settlement.js';
import { createSettlementRegistry } from './settlement_registry.js';

const JOB_ID = 1;

let rawStatus: PrintJobStatus | undefined;
let clearJobQueue: () => Promise<void>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  rawStatus = undefined;
  clearJobQueue = vi.fn(() => Promise.resolve());
});

afterEach(() => {
  vi.useRealTimers();
});

function createRegistry() {
  return createSettlementRegistry({
    getRawStatus: () =>
      rawStatus ? ok(rawStatus) : err(new Error('no status tracked')),
    clearJobQueue,
  });
}

test('passes through the raw status when no watch is running', () => {
  const registry = createRegistry();

  expect(registry.getJobStatus(JOB_ID).err()).toBeInstanceOf(Error);

  rawStatus = { outcome: 'sent-to-printer' };
  expect(registry.getJobStatus(JOB_ID)).toEqual(
    ok({ outcome: 'sent-to-printer' })
  );
});

test('masks a terminal status until the watch has run onSettled', async () => {
  const registry = createRegistry();
  rawStatus = { outcome: 'sent-to-printer' };

  let releaseOnSettled: () => void = () => {};
  const settledPromise = new Promise<void>((resolve) => {
    releaseOnSettled = resolve;
  });
  registry.awaitJobSettlement(JOB_ID, () => settledPromise);

  await vi.advanceTimersByTimeAsync(JOB_SETTLEMENT_POLL_INTERVAL_MS);
  expect(registry.getJobStatus(JOB_ID)).toEqual(ok({ outcome: 'in-progress' }));

  releaseOnSettled();
  await settledPromise;
  await vi.advanceTimersByTimeAsync(0);

  expect(registry.getJobStatus(JOB_ID)).toEqual(
    ok({ outcome: 'sent-to-printer' })
  );
});

test('clears the queue when a job fails', async () => {
  const registry = createRegistry();
  rawStatus = { outcome: 'failed', reason: 'Unable to send data to printer.' };
  const onSettled = vi.fn(() => Promise.resolve());

  registry.awaitJobSettlement(JOB_ID, onSettled);
  await vi.advanceTimersByTimeAsync(JOB_SETTLEMENT_POLL_INTERVAL_MS);

  expect(clearJobQueue).toHaveBeenCalled();
  expect(onSettled).toHaveBeenCalledWith({
    outcome: 'failed',
    reason: 'Unable to send data to printer.',
  });
});

test('a stopped watch stops masking', async () => {
  const registry = createRegistry();
  rawStatus = { outcome: 'in-progress' };
  const monitor = registry.awaitJobSettlement(JOB_ID, () => Promise.resolve());

  monitor.stop();
  rawStatus = { outcome: 'sent-to-printer' };
  await vi.advanceTimersByTimeAsync(JOB_SETTLEMENT_POLL_INTERVAL_MS * 3);

  // The watch is registered but never settles, so it keeps reporting in-progress
  expect(registry.getJobStatus(JOB_ID)).toEqual(ok({ outcome: 'in-progress' }));
});
