import React from 'react';
import userEvent from '@testing-library/user-event';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { render, screen, waitFor, within } from '@testing-library/react';
import { ResetPollsToPausedButton } from './reset_polls_to_paused_button';

test('component flow', async () => {
  const resetPollsToPaused = jest.fn();
  const logger = fakeLogger();
  render(
    <ResetPollsToPausedButton
      logger={logger}
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
  expect(logger.log).toHaveBeenCalledTimes(1);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.ResetPollsToPaused,
    'system_administrator',
    expect.objectContaining({
      message: 'Polls were reset from closed to paused.',
      disposition: 'success',
    })
  );
});

test('is disabled without callback', () => {
  const logger = fakeLogger();
  render(
    <ResetPollsToPausedButton
      resetPollsToPausedText="Reset Polls to Paused Text"
      logger={logger}
    />
  );

  // Initially should just contain the button
  expect(
    screen.getByRole('button', {
      name: 'Reset Polls to Paused',
    })
  ).toBeDisabled();
});
