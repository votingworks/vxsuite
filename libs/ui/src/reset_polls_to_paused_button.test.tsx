import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { ResetPollsToPausedButton } from './reset_polls_to_paused_button';

test('component flow', async () => {
  const resetPollsToPaused = jest.fn();
  render(
    <ResetPollsToPausedButton
      resetPollsToPausedText="Reset Polls to Paused Text"
      resetPollsToPaused={resetPollsToPaused}
    />
  );

  // Initially should just contain the button
  const mainButton = screen.getByRole('button', {
    name: 'Reset Polls to Paused',
  });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  // Clicking should show modal
  userEvent.click(mainButton);
  screen.getByRole('alertdialog');

  // Clicking cancel should close modal
  userEvent.click(
    screen.getByRole('button', {
      name: 'Close',
    })
  );
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  // Can reset polls
  userEvent.click(mainButton);
  const modal = screen.getByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', { name: 'Reset Polls to Paused' })
  );
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(resetPollsToPaused).toHaveBeenCalledTimes(1);
});

test('is disabled without callback', () => {
  render(
    <ResetPollsToPausedButton resetPollsToPausedText="Reset Polls to Paused Text" />
  );

  // Initially should just contain the button
  expect(
    screen.getByRole('button', {
      name: 'Reset Polls to Paused',
    })
  ).toBeDisabled();
});
