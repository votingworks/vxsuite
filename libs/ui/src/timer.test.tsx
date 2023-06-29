import MockDate from 'mockdate';

import { act, render, screen } from '@testing-library/react';
import { hasTextAcrossElements } from '@votingworks/test-utils';

import { Timer } from './timer';

beforeEach(() => {
  MockDate.set('2000-01-01T00:00:00Z');
  jest.useFakeTimers('legacy');
});

test('Timer', () => {
  const countDownTo = new Date(new Date().getTime() + 120 * 1000);
  render(<Timer countDownTo={countDownTo} />);

  screen.getByText(hasTextAcrossElements('02m 00s'));

  MockDate.set('2000-01-01T00:00:01Z');
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  screen.getByText(hasTextAcrossElements('01m 59s'));

  MockDate.set('2000-01-01T00:01:00Z');
  act(() => {
    jest.advanceTimersByTime(59 * 1000);
  });
  screen.getByText(hasTextAcrossElements('01m 00s'));

  MockDate.set('2000-01-01T00:01:30Z');
  act(() => {
    jest.advanceTimersByTime(30 * 1000);
  });
  screen.getByText(hasTextAcrossElements('00m 30s'));

  MockDate.set('2000-01-01T00:02:00Z');
  act(() => {
    jest.advanceTimersByTime(30 * 1000);
  });
  screen.getByText(hasTextAcrossElements('00m 00s'));

  MockDate.set('2000-01-01T00:02:01Z');
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  screen.getByText(hasTextAcrossElements('00m 00s'));
});

test('Timer shows hours if necessary', () => {
  const countDownTo = new Date(new Date().getTime() + 100 * 60 * 60 * 1000);
  render(<Timer countDownTo={countDownTo} />);

  screen.getByText(hasTextAcrossElements('100h 00m 00s'));

  MockDate.set('2000-01-01T00:00:01Z');
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  screen.getByText(hasTextAcrossElements('99h 59m 59s'));
});
