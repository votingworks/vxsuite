import { beforeEach, expect, test, vi } from 'vite-plus/test';
import { sleep } from './sleep';

beforeEach(() => {
  vi.useFakeTimers();
});

test('sleep', async () => {
  const sleepPromise = sleep(10);

  vi.advanceTimersByTime(9);
  expect(vi.getTimerCount()).toEqual(1);

  vi.advanceTimersByTime(2);
  await sleepPromise;
});
