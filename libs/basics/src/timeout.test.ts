import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { deferred } from './deferred.js';
import { timeout } from './timeout.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('resolves with the value when the promise settles before the deadline', async () => {
  expect(await timeout(30_000, Promise.resolve('done'))).toEqual({
    type: 'success',
    value: 'done',
  });
  expect(vi.getTimerCount()).toEqual(0);
});

test('resolves with a timeout when the deadline is reached first', async () => {
  const result = timeout(30_000, new Promise<string>(() => {}));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await result).toEqual({ type: 'timeout' });
});

test('rejects when the promise rejects before the deadline', async () => {
  await expect(
    timeout(30_000, Promise.reject(new Error('failed')))
  ).rejects.toThrow('failed');
  expect(vi.getTimerCount()).toEqual(0);
});

test('logs a rejection that arrives after the deadline', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { promise, reject } = deferred<string>();
  const result = timeout(30_000, promise);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await result).toEqual({ type: 'timeout' });

  const error = new Error('too late');
  reject(error);
  await vi.waitFor(() => {
    expect(consoleError).toHaveBeenCalledWith(
      'rejected after timing out at 30000 ms:',
      error
    );
  });
});

test('passes work a signal that stays unaborted when it finishes in time', async () => {
  let workSignal: AbortSignal | undefined;
  const result = await timeout(30_000, (signal) => {
    workSignal = signal;
    return Promise.resolve(42);
  });
  expect(result).toEqual({ type: 'success', value: 42 });
  expect(workSignal?.aborted).toEqual(false);
  expect(vi.getTimerCount()).toEqual(0);
});

test('aborts the work with a TimeoutError at the deadline', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  let workSignal: AbortSignal | undefined;
  const result = timeout(
    30_000,
    (signal) =>
      new Promise<number>((_resolve, reject) => {
        workSignal = signal;
        signal.addEventListener('abort', () => reject(signal.reason));
      })
  );
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await result).toEqual({ type: 'timeout' });

  expect(workSignal?.aborted).toEqual(true);
  expect(workSignal?.reason).toBeInstanceOf(DOMException);
  expect(workSignal?.reason).toMatchObject({
    name: 'TimeoutError',
    message: 'timed out after 30000 ms',
  });
  await vi.waitFor(() => {
    expect(consoleError).toHaveBeenCalledWith(
      'rejected after timing out at 30000 ms:',
      workSignal?.reason
    );
  });
});

test('rejects without starting a timer when the work throws synchronously', async () => {
  await expect(
    timeout(30_000, () => {
      throw new Error('bad start');
    })
  ).rejects.toThrow('bad start');
  expect(vi.getTimerCount()).toEqual(0);
});
