import {
  ElectionStringKey,
  LanguageCode,
  UiStringsPackage,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { newTestContext } from '../../test/test_context';
import { LanguageSettingsButton } from './language_settings_button';
import {
  act,
  render as renderWithoutContext,
  screen,
} from '../../test/react_testing_library';

test('displays current language', async () => {
  const { ENGLISH, SPANISH } = LanguageCode;
  const { getLanguageContext, mockApiClient, render } = newTestContext();

  const testTranslations: UiStringsPackage = {
    [ENGLISH]: { [ElectionStringKey.BALLOT_LANGUAGE]: 'English' },
    [SPANISH]: { [ElectionStringKey.BALLOT_LANGUAGE]: 'Español' },
  };
  mockApiClient.getUiStrings.mockImplementation((input) =>
    Promise.resolve(testTranslations[input.languageCode] || null)
  );

  render(<LanguageSettingsButton onPress={jest.fn()} />);
  await screen.findButton('English');

  act(() => getLanguageContext()?.setLanguage(SPANISH));
  await screen.findButton('Español');
});

test('fires onPress event', () => {
  const onPress = jest.fn();

  renderWithoutContext(<LanguageSettingsButton onPress={onPress} />);
  expect(onPress).not.toHaveBeenCalled();

  userEvent.click(screen.getButton('English'));
  expect(onPress).toHaveBeenCalledTimes(1);
});
