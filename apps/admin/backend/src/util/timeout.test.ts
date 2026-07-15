import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { deferred } from '@votingworks/basics';
import { timeout } from './timeout';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('resolves with the value when the promise settles before the deadline', async () => {
  const result = await timeout(30_000, Promise.resolve('done'));
  expect(result).toEqual({ type: 'success', value: 'done' });
});

test('resolves with a timeout when the deadline is reached first', async () => {
  const neverResolves = new Promise<string>(() => {});
  const resultPromise = timeout(30_000, neverResolves);

  await vi.advanceTimersByTimeAsync(30_000);

  expect(await resultPromise).toEqual({ type: 'timeout' });
});

test('clears the timer once the promise settles', async () => {
  const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
  const { promise, resolve } = deferred<number>();

  const resultPromise = timeout(30_000, promise);
  resolve(42);

  expect(await resultPromise).toEqual({ type: 'success', value: 42 });
  expect(clearTimeoutSpy).toHaveBeenCalled();
  // No pending timers remain, so advancing time changes nothing.
  expect(vi.getTimerCount()).toEqual(0);
});
