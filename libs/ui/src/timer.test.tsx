import { act, render, screen } from '@testing-library/react';
import { hasTextAcrossElements } from '@votingworks/test-utils';

import { Timer } from './timer';

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2000-01-01T00:00:00'));
});

test('Timer', () => {
  const countDownTo = new Date(new Date().getTime() + 120 * 1000);
  render(<Timer countDownTo={countDownTo} />);

  screen.getByText(hasTextAcrossElements('02m 00s'));

  act(() => {
    jest.advanceTimersByTime(1000);
  });
  screen.getByText(hasTextAcrossElements('01m 59s'));

  act(() => {
    jest.advanceTimersByTime(59 * 1000);
  });
  screen.getByText(hasTextAcrossElements('01m 00s'));

  act(() => {
    jest.advanceTimersByTime(30 * 1000);
  });
  screen.getByText(hasTextAcrossElements('00m 30s'));

  act(() => {
    jest.advanceTimersByTime(30 * 1000);
  });
  screen.getByText(hasTextAcrossElements('00m 00s'));

  act(() => {
    jest.advanceTimersByTime(1000);
  });
  screen.getByText(hasTextAcrossElements('00m 00s'));
});

test('Timer shows hours if necessary', () => {
  const countDownTo = new Date(new Date().getTime() + 100 * 60 * 60 * 1000);
  render(<Timer countDownTo={countDownTo} />);

  screen.getByText(hasTextAcrossElements('100h 00m 00s'));

  act(() => {
    jest.advanceTimersByTime(1000);
  });
  screen.getByText(hasTextAcrossElements('99h 59m 59s'));
});
