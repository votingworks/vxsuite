import React from 'react';
import i18next, { i18n } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { LanguageCode } from '@votingworks/types';
import { Optional, assertDefined } from '@votingworks/basics';
import { Screen } from '../screen';
import { UiStringsReactQueryApi } from '../hooks/ui_strings_api';

export const DEFAULT_LANGUAGE_CODE = LanguageCode.ENGLISH;
export const DEFAULT_I18NEXT_NAMESPACE = 'translation';

export interface FixedLanguageContextInterface {
  currentLanguageCode: LanguageCode;
  i18next: i18n;
  translationFunction: ReturnType<typeof useTranslation>['t'];
}

export const FixedLanguageContext =
  React.createContext<Optional<FixedLanguageContextInterface>>(undefined);

export function useFixedLanguageContext(): Optional<FixedLanguageContextInterface> {
  return React.useContext(FixedLanguageContext);
}

export interface LanguageContextInterface {
  api: UiStringsReactQueryApi;
  availableLanguages: LanguageCode[];
  currentLanguageCode: LanguageCode;
  i18next: i18n;
  setLanguage: (code: LanguageCode) => void;
  translationFunction: ReturnType<typeof useTranslation>['t'];
}

export const LanguageContext =
  React.createContext<Optional<LanguageContextInterface>>(undefined);

export function useLanguageContext(): Optional<LanguageContextInterface> {
  return React.useContext(LanguageContext);
}

const i18nextInitPromise = i18next.use(initReactI18next).init({
  lng: DEFAULT_LANGUAGE_CODE,
  supportedLngs: Object.values(LanguageCode),
  interpolation: {
    escapeValue: false, // Sanitization already handled by React.
  },
  react: {
    // Configure events that trigger re-renders:
    bindI18n: 'languageChanged loaded',
    bindI18nStore: 'added removed',
  },
});

/**
 * Loads UI Strings for the specified language from the backend, if available.
 */
export function UiStringsLoader(): React.ReactNode {
  const context = assertDefined(
    useLanguageContext(),
    'LanguageContext required for UiStringsLoader'
  );
  const languageCode = context.currentLanguageCode;
  const { data, isLoading } = context.api.getUiStrings.useQuery(languageCode);

  React.useEffect(() => {
    if (!languageCode || isLoading || !data) {
      return;
    }

    i18next.addResourceBundle(languageCode, DEFAULT_I18NEXT_NAMESPACE, {
      ...data,
    });
  }, [data, isLoading, languageCode]);

  return null;
}

export interface LanguageContextProviderProps {
  api: UiStringsReactQueryApi;
  children: React.ReactNode;
}

export function LanguageContextProvider(
  props: LanguageContextProviderProps
): JSX.Element {
  const { api, children } = props;

  const [currentLanguageCode, setLanguage] = React.useState(
    DEFAULT_LANGUAGE_CODE
  );
  const [isI18nextReady, setIs18nReady] = React.useState(false);

  const { t: translationFunction } = useTranslation();

  const availableLanguagesQuery = api.getAvailableLanguages.useQuery();

  React.useEffect(() => {
    async function waitForI18nextReady() {
      await i18nextInitPromise;
      setIs18nReady(true);
    }

    void waitForI18nextReady();
  }, []);

  if (!isI18nextReady || !availableLanguagesQuery.isSuccess) {
    // This state is too brief to warrant a loading screen which would only
    // flash for an instant - going with an empty screen, since this only
    // happens once on initial app render, before any content is rendered.
    return <Screen />;
  }

  // TODO(kofi): Add logging for missing translation keys and data fetch errors.

  return (
    <LanguageContext.Provider
      value={{
        api,
        availableLanguages: availableLanguagesQuery.data,
        currentLanguageCode,
        i18next,
        setLanguage,
        translationFunction,
      }}
    >
      <UiStringsLoader />
      {children}
    </LanguageContext.Provider>
  );
}
