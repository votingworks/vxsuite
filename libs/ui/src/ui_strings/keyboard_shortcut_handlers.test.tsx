import userEvent from '@testing-library/user-event';
import { LanguageCode } from '@votingworks/types';
import { newTestContext } from '../../test/test_context';
import { KeyboardShortcutHandlers } from './keyboard_shortcut_handlers';
import { act, screen, waitFor } from '../../test/react_testing_library';
import { useCurrentLanguage } from '..';

const { CHINESE_SIMPLIFIED, ENGLISH, SPANISH } = LanguageCode;

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
