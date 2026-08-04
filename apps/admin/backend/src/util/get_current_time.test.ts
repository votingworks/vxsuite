import { expect, test, vi } from 'vitest';
import { getCurrentTime } from './get_current_time.js';

const mockDate = new Date('2021-01-01T00:00:00Z');

vi.useFakeTimers().setSystemTime(mockDate);

test('getCurrentTime', () => {
  expect(getCurrentTime()).toEqual(mockDate.getTime());
});
