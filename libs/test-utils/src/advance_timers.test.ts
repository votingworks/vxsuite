import { advanceTimers, IDLE_TIMEOUT_SECONDS } from './advance_timers';

beforeEach(() => {
  jest.useFakeTimers();
});

test('advanceTimers advances by seconds', () => {
  let timerHasFired = false;
  setTimeout(() => {
    timerHasFired = true;
  }, 1000);

  expect(timerHasFired).toBe(false);
  advanceTimers(1);
  expect(timerHasFired).toBe(true);
});

test('advanceTimers throws error if seconds is greater than IDLE_TIMEOUT_SECONDS', () => {
  expect(() => {
    advanceTimers(IDLE_TIMEOUT_SECONDS + 1);
  }).toThrowError(
    `Seconds value should not be greater than ${IDLE_TIMEOUT_SECONDS}`
  );
});
