import { advanceTimersAndPromises } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library';
import { IdlePage } from './idle_page';
import { IDLE_RESET_TIMEOUT_SECONDS } from '../config/globals';

beforeEach(() => {
  jest.useFakeTimers();
});

test('renders', async () => {
  render(<IdlePage />);
  expect(await screen.findByText('Are you still voting?')).toBeInTheDocument();
  expect(await screen.findByRole('button')).toBeInTheDocument();
});

test('shows a countdown when there is little time left', async () => {
  render(<IdlePage />);
  await advanceTimersAndPromises(IDLE_RESET_TIMEOUT_SECONDS / 2);
  expect(
    await screen.findByText(
      /To protect your privacy, this ballot will be cleared/
    )
  ).toBeInTheDocument();
});

test('calls onDismiss when the button is clicked', async () => {
  const onDismiss = jest.fn();
  render(<IdlePage onDismiss={onDismiss} />);
  userEvent.click(await screen.findByRole('button'));
  expect(onDismiss).toHaveBeenCalled();
});

test('calls onCountdownEnd when the timer runs out', async () => {
  const onCountdownEnd = jest.fn();
  render(<IdlePage onCountdownEnd={onCountdownEnd} />);
  await advanceTimersAndPromises(IDLE_RESET_TIMEOUT_SECONDS);
  expect(onCountdownEnd).toHaveBeenCalled();
});
