import { sleep } from './sleep';

beforeEach(() => {
  jest.useFakeTimers();
});

test('sleep', async () => {
  const sleepPromise = sleep(10);

  jest.advanceTimersByTime(9);
  expect(jest.getTimerCount()).toEqual(1);

  jest.advanceTimersByTime(2);
  await sleepPromise;
});
