import { LanguageCode } from '@votingworks/types';
import { H1 } from '..';
import {
  act,
  render as renderWithoutContext,
  screen,
} from '../../test/react_testing_library';
import {
  TEST_UI_STRING_TRANSLATIONS,
  testUiStrings,
} from '../../test/test_ui_strings';
import { newTestContext } from '../../test/test_context';
import { UiString } from './ui_string';
import { UiStringAudioDataAttributeName } from './with_audio';

const { getLanguageContext, mockApiClient, render } = newTestContext();

beforeEach(() => {
  mockApiClient.getAvailableLanguages.mockResolvedValue([
    LanguageCode.ENGLISH,
    LanguageCode.SPANISH,
  ]);

  mockApiClient.getUiStrings.mockImplementation(({ languageCode }) =>
    Promise.resolve(TEST_UI_STRING_TRANSLATIONS[languageCode] || null)
  );
});

test('renders without UiStringContext', () => {
  renderWithoutContext(<H1>{testUiStrings.numPlanets(9)}</H1>);
  screen.getByRole('heading', { name: '[Untranslated] There are 9 planets.' });
});

test('renders translation for current language', async () => {
  render(<H1>{testUiStrings.numPlanets(9)}</H1>);
  await screen.findByRole('heading', { name: 'There are 9 planets.' });

  act(() => getLanguageContext()?.setLanguage(LanguageCode.SPANISH));
  await screen.findByRole('heading', { name: 'Hay 9 planetas.' });
});

test('renders plural variations based on `pluralCount` prop', async () => {
  render(<H1>{testUiStrings.numPlanets(1)}</H1>);
  await screen.findByRole('heading', { name: 'There is only 1 planet.' });
});

test('renders deeply nested translations', async () => {
  const { rerender } = render(<H1>{testUiStrings.planetName('planet1')}</H1>);
  await screen.findByRole('heading', { name: 'Mercury' });

  rerender(<H1>{testUiStrings.planetName('planet9')}</H1>);
  await screen.findByRole('heading', { name: 'Pluto' });
});

test('renders within optional element type override', async () => {
  render(
    <UiString as="h1" uiStringKey="planetName" uiStringSubKey="planet9">
      Fallback text
    </UiString>
  );

  await screen.findByRole('heading', { name: 'Pluto' });
});

test('renders with audio data attributes', async () => {
  const { I18N_KEY, LANGUAGE_CODE } = UiStringAudioDataAttributeName;

  render(
    <UiString as="h1" uiStringKey="planetName" uiStringSubKey="planet9">
      Fallback text
    </UiString>
  );

  const pluto = await screen.findByRole('heading', { name: 'Pluto' });
  const container = pluto.parentElement;
  expect(container).toHaveAttribute(I18N_KEY, 'planetName.planet9');
  expect(container).toHaveAttribute(LANGUAGE_CODE, LanguageCode.ENGLISH);
});
