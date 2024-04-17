import userEvent from '@testing-library/user-event';

import { VoterSettingsButton } from './voter_settings_button';
import { render, screen } from '../../test/react_testing_library';

test('navigates to settings screen', () => {
  const onPress = jest.fn();

  render(<VoterSettingsButton onPress={onPress} />);

  expect(onPress).not.toHaveBeenCalled();

  userEvent.click(screen.getButton('Settings'));

  expect(onPress).toHaveBeenCalled();
});
