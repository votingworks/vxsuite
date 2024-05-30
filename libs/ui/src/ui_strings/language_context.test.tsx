import { LanguageCode } from '@votingworks/types';
import { act } from 'react';
import {
  screen,
  waitFor,
  render as genericRender,
} from '../../test/react_testing_library';
import { newTestContext } from '../../test/test_context';
import {
  TEST_UI_STRING_TRANSLATIONS,
  testUiStrings,
} from '../../test/test_ui_strings';
import {
  BackendLanguageContextProvider,
  DEFAULT_I18NEXT_NAMESPACE,
  DEFAULT_LANGUAGE_CODE,
} from './language_context';

const { getLanguageContext, mockApiClient, render } = newTestContext();

beforeEach(() => {
  jest.resetAllMocks();

  mockApiClient.getAvailableLanguages.mockResolvedValueOnce([
    LanguageCode.ENGLISH,
    LanguageCode.CHINESE_TRADITIONAL,
  ]);

  mockApiClient.getUiStrings.mockImplementation(({ languageCode }) =>
    Promise.resolve(TEST_UI_STRING_TRANSLATIONS[languageCode] || null)
  );
});

test('availableLanguages', async () => {
  render(<div>foo</div>);

  await waitFor(() => expect(getLanguageContext()).toBeDefined());
  expect(getLanguageContext()?.availableLanguages).toEqual([
    LanguageCode.ENGLISH,
    LanguageCode.CHINESE_TRADITIONAL,
  ]);
});

test('setLanguage', async () => {
  render(<div>foo</div>);

  await waitFor(() => expect(getLanguageContext()).toBeDefined());

  expect(getLanguageContext()?.currentLanguageCode).toEqual(
    DEFAULT_LANGUAGE_CODE
  );
  expect(
    getLanguageContext()?.i18next.getResourceBundle(
      DEFAULT_LANGUAGE_CODE,
      DEFAULT_I18NEXT_NAMESPACE
    )
  ).toEqual(TEST_UI_STRING_TRANSLATIONS[DEFAULT_LANGUAGE_CODE]);

  act(
    () => getLanguageContext()?.setLanguage(LanguageCode.CHINESE_TRADITIONAL)
  );

  await waitFor(() =>
    expect(getLanguageContext()?.currentLanguageCode).toEqual(
      LanguageCode.CHINESE_TRADITIONAL
    )
  );
  expect(
    getLanguageContext()?.i18next.getResourceBundle(
      LanguageCode.CHINESE_TRADITIONAL,
      DEFAULT_I18NEXT_NAMESPACE
    )
  ).toEqual(TEST_UI_STRING_TRANSLATIONS[LanguageCode.CHINESE_TRADITIONAL]);
});

test('BackendLanguageContextProvider', async () => {
  genericRender(
    <BackendLanguageContextProvider
      currentLanguageCode={DEFAULT_LANGUAGE_CODE}
      uiStringsPackage={TEST_UI_STRING_TRANSLATIONS}
    >
      {testUiStrings.planetName('planet3')}
    </BackendLanguageContextProvider>
  );

  await screen.findByText('Earth');

  genericRender(
    <BackendLanguageContextProvider
      currentLanguageCode={LanguageCode.SPANISH}
      uiStringsPackage={TEST_UI_STRING_TRANSLATIONS}
    >
      {testUiStrings.planetName('planet3')}
    </BackendLanguageContextProvider>
  );

  await screen.findByText('Tierra');
});
