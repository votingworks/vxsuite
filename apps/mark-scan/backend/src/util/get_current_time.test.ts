import { expect, test, vi } from 'vitest';
import { getCurrentTime } from './get_current_time';

test('getCurrentTime', () => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: 1620000000000,
  });
  expect(getCurrentTime()).toEqual(1620000000000);
});
