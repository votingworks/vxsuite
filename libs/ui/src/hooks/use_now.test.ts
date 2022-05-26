import { act, renderHook } from '@testing-library/react-hooks';
import { useNow } from './use_now';

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2021-03-31T00:00:00Z'));
});

test('returns the current date', () => {
  const { result } = renderHook(() => useNow());
  const now = result.current;
  expect(now.toISO()).toEqual('2021-03-31T00:00:00.000+00:00');
});

test('keeps returning the right date as time moves forward', () => {
  const { result } = renderHook(() => useNow());

  expect(result.current.toISO()).toEqual('2021-03-31T00:00:00.000+00:00');

  act(() => {
    jest.advanceTimersByTime(1000);
  });

  expect(result.current.toISO()).toEqual('2021-03-31T00:00:01.000+00:00');
});
