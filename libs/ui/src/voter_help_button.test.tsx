import { expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';

import { render, screen } from '../test/react_testing_library.js';
import { VoterHelpButton } from './voter_help_button.js';

test('VoterHelpButton', async () => {
  const onPress = vi.fn();
  render(<VoterHelpButton onPress={onPress} />);

  const voterHelpButton = screen.getByRole('button', {
    name: 'Help',
  });
  await userEvent.click(voterHelpButton);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('VoterHelpButton disabled', async () => {
  const onPress = vi.fn();
  render(<VoterHelpButton disabled onPress={onPress} />);

  const voterHelpButton = screen.getByRole('button', {
    name: 'Help',
  });
  expect(voterHelpButton).toBeDisabled();
  await userEvent.click(voterHelpButton);
  expect(onPress).toHaveBeenCalledTimes(0);
});
