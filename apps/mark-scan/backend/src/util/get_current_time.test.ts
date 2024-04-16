import { getCurrentTime } from './get_current_time';

test('getCurrentTime', () => {
  jest.useFakeTimers().setSystemTime(1620000000000);
  expect(getCurrentTime()).toEqual(1620000000000);
});
