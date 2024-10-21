import userEvent from '@testing-library/user-event';
import { AudioControls } from '@votingworks/types';
import {
  advancePromises,
  mockUseAudioControls,
  TestLanguageCode,
} from '@votingworks/test-utils';
import { newTestContext } from '../../test/test_context';
import { KeyboardShortcutHandlers } from './keyboard_shortcut_handlers';
import { act, render, screen, waitFor } from '../../test/react_testing_library';
import { useCurrentLanguage } from '../hooks/use_current_language';
import { Keybinding } from '..';

const { CHINESE_SIMPLIFIED, ENGLISH, SPANISH } = TestLanguageCode;
const audioControls: AudioControls = mockUseAudioControls();

jest.mock(
  '../hooks/use_audio_controls',
  (): typeof import('../hooks/use_audio_controls') => ({
    useAudioControls: () => audioControls,
  })
);

test('Shift+L switches display language', async () => {
  const { mockApiClient, render: renderWithContext } = newTestContext();

  mockApiClient.getAvailableLanguages.mockResolvedValue([
    CHINESE_SIMPLIFIED,
    ENGLISH,
    SPANISH,
  ]);

  let currentLanguage: string | undefined;

  function CurrentLanguageConsumer() {
    currentLanguage = useCurrentLanguage();
    return null;
  }

  renderWithContext(
    <div>
      <KeyboardShortcutHandlers />
      <CurrentLanguageConsumer />
      <span>foo</span>
    </div>
  );

  await waitFor(() => screen.getByText('foo'));

  expect(currentLanguage).toEqual(ENGLISH);

  await act(() => userEvent.keyboard(Keybinding.SWITCH_LANGUAGE));
  expect(currentLanguage).toEqual(SPANISH);

  await act(() => userEvent.keyboard(Keybinding.SWITCH_LANGUAGE));
  expect(currentLanguage).toEqual(CHINESE_SIMPLIFIED);

  await act(() => userEvent.keyboard(Keybinding.SWITCH_LANGUAGE));
  expect(currentLanguage).toEqual(ENGLISH);

  // Should be a no-op without the `Shift` key modifier:
  await act(() => userEvent.keyboard('l'));
  expect(currentLanguage).toEqual(ENGLISH);
});

test.each([
  { key: Keybinding.TOGGLE_AUDIO, expectedFnCall: audioControls.toggleEnabled },
  {
    key: Keybinding.PLAYBACK_RATE_DOWN,
    expectedFnCall: audioControls.decreasePlaybackRate,
  },
  {
    key: Keybinding.PLAYBACK_RATE_UP,
    expectedFnCall: audioControls.increasePlaybackRate,
  },
  { key: Keybinding.TOGGLE_PAUSE, expectedFnCall: audioControls.togglePause },
  { key: Keybinding.VOLUME_DOWN, expectedFnCall: audioControls.decreaseVolume },
  { key: Keybinding.VOLUME_UP, expectedFnCall: audioControls.increaseVolume },
])(
  '"$key" key calls expected audioControls function',
  async ({ key, expectedFnCall }) => {
    render(<KeyboardShortcutHandlers />);

    await act(async () => {
      userEvent.keyboard(key);
      await advancePromises();
    });

    expect(expectedFnCall).toHaveBeenCalled();
  }
);
