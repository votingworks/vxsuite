import userEvent from '@testing-library/user-event';
import { AudioControls, LanguageCode } from '@votingworks/types';
import { advancePromises, fakeUseAudioControls } from '@votingworks/test-utils';
import { newTestContext } from '../../test/test_context';
import { KeyboardShortcutHandlers } from './keyboard_shortcut_handlers';
import { act, screen, waitFor } from '../../test/react_testing_library';
import { useCurrentLanguage } from '../hooks/use_current_language';

const { CHINESE_SIMPLIFIED, ENGLISH, SPANISH } = LanguageCode;
const audioControls: AudioControls = fakeUseAudioControls();

jest.mock(
  '../hooks/use_audio_controls',
  (): typeof import('../hooks/use_audio_controls') => ({
    useAudioControls: () => audioControls,
  })
);

test('Shift+L switches display language', async () => {
  const { mockBackendApi, render } = newTestContext();

  mockBackendApi.getAvailableLanguages.mockResolvedValue([
    CHINESE_SIMPLIFIED,
    ENGLISH,
    SPANISH,
  ]);

  let currentLanguage: LanguageCode | undefined;

  function CurrentLanguageConsumer() {
    currentLanguage = useCurrentLanguage();
    return null;
  }

  render(
    <div>
      <KeyboardShortcutHandlers />
      <CurrentLanguageConsumer />
      <span>foo</span>
    </div>
  );

  await waitFor(() => screen.getByText('foo'));

  expect(currentLanguage).toEqual(ENGLISH);

  await act(() => userEvent.keyboard('L'));
  expect(currentLanguage).toEqual(SPANISH);

  await act(() => userEvent.keyboard('L'));
  expect(currentLanguage).toEqual(CHINESE_SIMPLIFIED);

  await act(() => userEvent.keyboard('L'));
  expect(currentLanguage).toEqual(ENGLISH);

  // Should be a no-op without the `Shift` key modifier:
  await act(() => userEvent.keyboard('l'));
  expect(currentLanguage).toEqual(ENGLISH);
});

test.each([
  { key: 'R', expectedFnCall: audioControls.replay },
  { key: '[[', expectedFnCall: audioControls.decreasePlaybackRate },
  { key: ']]', expectedFnCall: audioControls.increasePlaybackRate },
  { key: 'P', expectedFnCall: audioControls.togglePause },
  { key: '-', expectedFnCall: audioControls.decreaseVolume },
  { key: '=', expectedFnCall: audioControls.increaseVolume },
])(
  '"$key" key calls expected audioControls function',
  async ({ key, expectedFnCall }) => {
    const { render } = newTestContext();

    render(
      <div>
        <KeyboardShortcutHandlers />
      </div>
    );

    await act(async () => {
      userEvent.keyboard(key);
      await advancePromises();
    });

    expect(expectedFnCall).toHaveBeenCalled();
  }
);
