import { getCurrentTime } from './get_current_time';

const mockDate = new Date('2021-01-01T00:00:00Z');

jest.useFakeTimers().setSystemTime(mockDate);

test('getCurrentTime', () => {
  expect(getCurrentTime()).toEqual(mockDate.getTime());
});
