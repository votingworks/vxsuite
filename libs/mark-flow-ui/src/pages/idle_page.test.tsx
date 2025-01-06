import { beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, render, screen, waitFor } from '../../test/react_testing_library';
import { IdlePage } from './idle_page';
import { IDLE_RESET_TIMEOUT_SECONDS } from '../config/globals';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

test('renders', async () => {
  render(<IdlePage />);
  expect(await screen.findByText('Are you still voting?')).toBeInTheDocument();
  expect(await screen.findByRole('button')).toBeInTheDocument();
});

test('shows a countdown when there is little time left', async () => {
  render(<IdlePage />);
  act(() => {
    vi.advanceTimersByTime((IDLE_RESET_TIMEOUT_SECONDS / 2) * 1000);
  });
  expect(
    await screen.findByText(
      /To protect your privacy, this ballot will be cleared/
    )
  ).toBeInTheDocument();
});

test('calls onDismiss when the button is clicked', async () => {
  const onDismiss = vi.fn();
  render(<IdlePage onDismiss={onDismiss} />);
  userEvent.click(await screen.findByRole('button'));
  expect(onDismiss).toHaveBeenCalled();
});

test('calls onCountdownEnd when the timer runs out', async () => {
  const onCountdownEnd = vi.fn();
  render(<IdlePage onCountdownEnd={onCountdownEnd} />);
  act(() => {
    vi.advanceTimersByTime(IDLE_RESET_TIMEOUT_SECONDS * 1000);
  });
  await waitFor(() => {
    expect(onCountdownEnd).toHaveBeenCalled();
  });
});
