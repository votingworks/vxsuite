import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../test/react_testing_library';
import { VoterHelpButton } from './voter_help_button';

test('VoterHelpButton', () => {
  const onPress = vi.fn();
  render(<VoterHelpButton onPress={onPress} />);

  const voterHelpButton = screen.getByRole('button', {
    name: 'Help',
  });
  userEvent.click(voterHelpButton);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('VoterHelpButton disabled', () => {
  const onPress = vi.fn();
  render(<VoterHelpButton disabled onPress={onPress} />);

  const voterHelpButton = screen.getByRole('button', {
    name: 'Help',
  });
  expect(voterHelpButton).toBeDisabled();
  userEvent.click(voterHelpButton);
  expect(onPress).toHaveBeenCalledTimes(0);
});
