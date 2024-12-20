import userEvent from '@testing-library/user-event';
import { mockOf } from '@votingworks/test-utils';
import { screen } from '../../test/react_testing_library';
import { ToggleAudioButton } from './toggle_audio_button';
import { newTestContext } from '../../test/test_context';
import { useHeadphonesPluggedIn } from '../hooks/use_headphones_plugged_in';

jest.mock('../hooks/use_headphones_plugged_in');

const mockUseHeadphonesPluggedIn = mockOf(useHeadphonesPluggedIn);

test('status text corresponds to audio state', async () => {
  const { getAudioContext, render } = newTestContext();

  mockUseHeadphonesPluggedIn.mockReturnValue(true);

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

test('is disabled when headphones not detected', async () => {
  const { render } = newTestContext();

  mockUseHeadphonesPluggedIn.mockReturnValue(false);

  render(<ToggleAudioButton />);

  const button = await screen.findButton(/no headphones detected/i);
  expect(button).toBeDisabled();
});
