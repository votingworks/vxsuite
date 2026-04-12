import { beforeEach, expect, test, vi } from 'vitest';

import { fireEvent, render, screen } from '../test/react_testing_library';
import {
  DEFAULT_MIN_TOUCH_DURATION_MS,
  MinTouchDurationGuard,
} from './min_touch_duration_guard';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

function renderWithButton(minTouchDurationMs?: number) {
  const onClick = vi.fn();
  render(
    <MinTouchDurationGuard minTouchDurationMs={minTouchDurationMs}>
      <button type="button" onClick={onClick}>
        Press
      </button>
    </MinTouchDurationGuard>
  );
  return { onClick };
}

function pointerDownThenClick(durationMs: number) {
  const button = screen.getByRole('button');
  fireEvent.pointerDown(button);
  vi.advanceTimersByTime(durationMs);
  fireEvent.click(button);
}

test('blocks clicks from touches shorter than the default minimum duration', () => {
  const { onClick } = renderWithButton();
  pointerDownThenClick(DEFAULT_MIN_TOUCH_DURATION_MS - 1);
  expect(onClick).not.toHaveBeenCalled();
});

test('allows clicks from touches at the default minimum duration', () => {
  const { onClick } = renderWithButton();
  pointerDownThenClick(DEFAULT_MIN_TOUCH_DURATION_MS);
  expect(onClick).toHaveBeenCalledOnce();
});

test('allows clicks from touches above the default minimum duration', () => {
  const { onClick } = renderWithButton();
  pointerDownThenClick(DEFAULT_MIN_TOUCH_DURATION_MS * 2);
  expect(onClick).toHaveBeenCalledOnce();
});

test('respects a custom minimum touch duration', () => {
  const { onClick } = renderWithButton(200);

  pointerDownThenClick(199);
  expect(onClick).not.toHaveBeenCalled();

  pointerDownThenClick(200);
  expect(onClick).toHaveBeenCalledOnce();
});

test('allows clicks with no preceding pointer event', () => {
  const { onClick } = renderWithButton();
  fireEvent.click(screen.getByRole('button'));
  expect(onClick).toHaveBeenCalledOnce();
});

test('resets pointer-down tracking after each click', () => {
  const { onClick } = renderWithButton();

  pointerDownThenClick(DEFAULT_MIN_TOUCH_DURATION_MS);
  expect(onClick).toHaveBeenCalledOnce();

  pointerDownThenClick(DEFAULT_MIN_TOUCH_DURATION_MS - 1);
  expect(onClick).toHaveBeenCalledOnce();

  pointerDownThenClick(DEFAULT_MIN_TOUCH_DURATION_MS);
  expect(onClick).toHaveBeenCalledTimes(2);
});
