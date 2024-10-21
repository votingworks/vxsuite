import { UiStringsPackage } from '@votingworks/types';
import { H1 } from '..';
import {
  act,
  render as renderWithoutContext,
  screen,
  waitFor,
} from '../../test/react_testing_library';
import {
  TEST_UI_STRING_TRANSLATIONS,
  testUiStrings,
} from '../../test/test_ui_strings';
import { newTestContext } from '../../test/test_context';
import { UiRichTextString, UiString } from './ui_string';
import { UiStringAudioDataAttributeName } from './with_audio';

describe('UiString', () => {
  const { getLanguageContext, mockApiClient, render } = newTestContext();
  beforeEach(() => {
    mockApiClient.getAvailableLanguages.mockResolvedValue(['en', 'es-US']);

    mockApiClient.getUiStrings.mockImplementation(({ languageCode }) =>
      Promise.resolve(TEST_UI_STRING_TRANSLATIONS[languageCode] || null)
    );
  });
  test('renders without UiStringContext', () => {
    renderWithoutContext(<H1>{testUiStrings.numPlanets(9)}</H1>);
    screen.getByRole('heading', {
      name: '[Untranslated] There are 9 planets.',
    });
  });

  test('renders translation for current language', async () => {
    render(<H1>{testUiStrings.numPlanets(9)}</H1>);
    await screen.findByRole('heading', { name: 'There are 9 planets.' });

    act(() => getLanguageContext()?.setLanguage('es-US'));
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
    expect(container).toHaveAttribute(LANGUAGE_CODE, 'en');
  });
});

describe('UiRichTextString', () => {
  const testRichTextStringTranslations: UiStringsPackage = {
    en: {
      richText: {
        bold: 'This is <strong>bold</strong>',
        italic: 'This is <em>italic</em>',
      },
      image: 'This has an image <img src="test-src">',
    },
    'es-US': {
      richText: {
        bold: 'Esto es <strong>negrita</strong>',
        italic: 'Esto es <em>cursiva</em>',
      },
      image: 'Esto tiene una imagen <img src="test-src">',
    },
  };

  const testRichTextStrings = {
    richText: (format: 'bold' | 'italic') => (
      <UiRichTextString uiStringKey="richText" uiStringSubKey={format}>
        {`[Untranslated] ${
          format === 'bold'
            ? 'This is <strong>bold</strong>'
            : 'This is <em>italic</em>'
        }`}
      </UiRichTextString>
    ),
    image: () => (
      <UiRichTextString uiStringKey="image">
        {'[Untranslated] This has an image <img src="test-src">'}
      </UiRichTextString>
    ),
  } as const;

  const { getLanguageContext, mockApiClient, render } = newTestContext();

  beforeEach(() => {
    mockApiClient.getAvailableLanguages.mockResolvedValue(['en', 'es-US']);

    mockApiClient.getUiStrings.mockImplementation(({ languageCode }) =>
      Promise.resolve(testRichTextStringTranslations[languageCode] || null)
    );
  });

  test('renders without UiStringContext', () => {
    const { container } = renderWithoutContext(
      testRichTextStrings.richText('bold')
    );
    expect(container.firstElementChild?.innerHTML).toEqual(
      '<div>[Untranslated] This is <strong>bold</strong></div>'
    );
  });

  test('renders translation for current language', async () => {
    const { container } = render(testRichTextStrings.image());
    await screen.findByText(/^This has an image/);
    expect(container.firstElementChild?.innerHTML).toEqual(
      '<div>This has an image <img src="test-src"></div>'
    );

    act(() => getLanguageContext()?.setLanguage('es-US'));
    await waitFor(() => screen.findByText(/Esto tiene una imagen/));
    expect(container.firstElementChild?.innerHTML).toEqual(
      '<div>Esto tiene una imagen <img src="test-src"></div>'
    );
  });

  test('renders deeply nested translations', async () => {
    const { container } = render(testRichTextStrings.richText('italic'));
    await screen.findByText(/This is/);
    expect(container.firstElementChild?.innerHTML).toEqual(
      '<div>This is <em>italic</em></div>'
    );
  });

  test('renders with audio data attributes', async () => {
    const { I18N_KEY, LANGUAGE_CODE } = UiStringAudioDataAttributeName;
    const { container } = render(testRichTextStrings.richText('bold'));
    await screen.findByText(/This is/);
    expect(container.firstElementChild).toHaveAttribute(
      I18N_KEY,
      'richText.bold'
    );
    expect(container.firstElementChild).toHaveAttribute(LANGUAGE_CODE, 'en');
  });

  test('falls back to children if key not found', async () => {
    render(
      <UiRichTextString uiStringKey="missingKey">
        fall back text
      </UiRichTextString>
    );
    await screen.findByText('fall back text');
  });
});
