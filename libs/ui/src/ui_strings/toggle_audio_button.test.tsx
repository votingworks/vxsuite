import userEvent from '@testing-library/user-event';
import { screen } from '../../test/react_testing_library';
import { ToggleAudioButton } from './toggle_audio_button';
import { newTestContext } from '../../test/test_context';

test('status text corresponds to audio state', async () => {
  const { getAudioContext, render } = newTestContext();

  render(<ToggleAudioButton />);

  await screen.findAllByText('Audio is on');
  expect(getAudioContext()!.isEnabled).toEqual(true);

  userEvent.click(screen.getButton(/mute audio/i));

  await screen.findAllByText('Audio is muted');
  expect(getAudioContext()!.isEnabled).toEqual(false);

  userEvent.click(screen.getButton(/unmute audio/i));

  await screen.findAllByText('Audio is on');
  expect(getAudioContext()!.isEnabled).toEqual(true);
});
