import { sleep } from './sleep';

beforeEach(() => {
  jest.useFakeTimers();
});

test('sleep', async () => {
  const now = Date.now();
  await sleep(10);
  expect(Date.now() - now).toBeGreaterThanOrEqual(10);
});
