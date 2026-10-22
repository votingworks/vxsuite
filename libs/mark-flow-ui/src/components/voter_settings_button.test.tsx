import { expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';

import { VoterSettingsButton } from './voter_settings_button.js';
import { render, screen } from '../../test/react_testing_library.js';

test('navigates to settings screen', async () => {
  const onPress = vi.fn();

  render(<VoterSettingsButton onPress={onPress} />);

  expect(onPress).not.toHaveBeenCalled();

  await userEvent.click(screen.getButton('Settings'));

  expect(onPress).toHaveBeenCalled();
});
