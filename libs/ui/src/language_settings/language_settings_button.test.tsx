import {
  ElectionStringKey,
  LanguageCode,
  UiStringsPackage,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { newTestContext } from '../../test/test_context';
import { LanguageSettingsButton } from './language_settings_button';
import { act, screen } from '../../test/react_testing_library';

const { ENGLISH, SPANISH } = LanguageCode;

test('displays current language', async () => {
  const { getLanguageContext, mockApiClient, render } = newTestContext();

  mockApiClient.getAvailableLanguages.mockResolvedValue([ENGLISH, SPANISH]);

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

test('fires onPress event', async () => {
  const { mockApiClient, render } = newTestContext();

  mockApiClient.getAvailableLanguages.mockResolvedValue([ENGLISH, SPANISH]);

  const onPress = jest.fn();

  render(<LanguageSettingsButton onPress={onPress} />);
  expect(onPress).not.toHaveBeenCalled();

  userEvent.click(await screen.findButton('English'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('not rendered in single-language contexts', async () => {
  const { mockApiClient, render } = newTestContext();

  mockApiClient.getAvailableLanguages.mockResolvedValue([ENGLISH]);

  render(
    <div>
      <h1>Welcome</h1>
      <LanguageSettingsButton onPress={jest.fn()} />
    </div>
  );
  await screen.findByText('Welcome');

  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
