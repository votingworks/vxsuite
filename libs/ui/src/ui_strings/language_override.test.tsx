import { UiStringsPackage } from '@votingworks/types';
import { act } from 'react';
import {
  render as renderWithoutContext,
  screen,
  waitFor,
} from '../../test/react_testing_library';
import { newTestContext } from '../../test/test_context';
import { InEnglish, LanguageOverride } from './language_override';
import { Button, appStrings } from '..';

test('LanguageOverride overrides current active language', async () => {
  const { getLanguageContext, mockApiClient, render } = newTestContext();

  const testTranslations: UiStringsPackage = {
    en: { buttonOkay: 'Cool beans' },
    'es-US': { buttonOkay: 'Bueno' },
  };
  mockApiClient.getUiStrings.mockImplementation(({ languageCode }) =>
    Promise.resolve(testTranslations[languageCode] || null)
  );

  render(
    <LanguageOverride languageCode="es-US">
      <Button onPress={() => {}}>{appStrings.buttonOkay()}</Button>
    </LanguageOverride>
  );

  await screen.findButton('Bueno');
  expect(getLanguageContext()?.currentLanguageCode).toEqual('en');
});

test('LanguageOverride is no-op when parent context is missing', async () => {
  const { mockApiClient } = newTestContext();

  const testTranslations: UiStringsPackage = {
    en: { buttonOkay: 'Cool beans' },
    'es-US': { buttonOkay: 'Bueno' },
  };
  mockApiClient.getUiStrings.mockImplementation(({ languageCode }) =>
    Promise.resolve(testTranslations[languageCode] || null)
  );

  renderWithoutContext(
    <LanguageOverride languageCode="es-US">
      <Button onPress={() => {}}>{appStrings.buttonOkay()}</Button>
    </LanguageOverride>
  );

  await screen.findButton('Cool beans');
});

test('InEnglish forces English translation', async () => {
  const { getLanguageContext, mockApiClient, render } = newTestContext();

  const testTranslations: UiStringsPackage = {
    en: { buttonOkay: 'Cool beans' },
    'es-US': { buttonOkay: 'Bueno' },
  };
  mockApiClient.getUiStrings.mockImplementation(({ languageCode }) =>
    Promise.resolve(testTranslations[languageCode] || null)
  );

  render(
    <InEnglish>
      <Button onPress={() => {}}>{appStrings.buttonOkay()}</Button>
    </InEnglish>
  );

  await waitFor(() => expect(getLanguageContext()).toBeDefined());
  act(() => getLanguageContext()?.setLanguage('es-US'));

  await screen.findButton('Cool beans');
  expect(getLanguageContext()?.currentLanguageCode).toEqual('es-US');
});
