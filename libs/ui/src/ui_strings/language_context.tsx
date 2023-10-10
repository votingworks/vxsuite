import React from 'react';
import i18next, { i18n } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { LanguageCode } from '@votingworks/types';
import { Optional } from '@votingworks/basics';
import { Screen } from '../screen';
import { UiStringsReactQueryApi } from '../hooks/ui_strings_api';

export interface LanguageContextInterface {
  availableLanguages: LanguageCode[];
  currentLanguageCode: LanguageCode;
  i18next: i18n;
  setLanguage: (code: LanguageCode) => void;
  translationFunction: ReturnType<typeof useTranslation>['t'];
}

export const DEFAULT_LANGUAGE_CODE = LanguageCode.ENGLISH;
export const DEFAULT_I18NEXT_NAMESPACE = 'translation';

const LanguageContext =
  React.createContext<Optional<LanguageContextInterface>>(undefined);

export function useLanguageContext(): Optional<LanguageContextInterface> {
  return React.useContext(LanguageContext);
}

const i18nextInitPromise = i18next.use(initReactI18next).init({
  lng: DEFAULT_LANGUAGE_CODE,
  fallbackLng: DEFAULT_LANGUAGE_CODE,
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

  const uiStringsQuery = api.getUiStrings.useQuery(currentLanguageCode);
  const availableLanguagesQuery = api.getAvailableLanguages.useQuery();

  React.useEffect(() => {
    async function waitForI18nextReady() {
      await i18nextInitPromise;
      setIs18nReady(true);
    }

    void waitForI18nextReady();
  }, []);

  const uiStringsData = uiStringsQuery.data;
  const isUiStringsLoading = uiStringsQuery.isLoading;

  React.useEffect(() => {
    if (isUiStringsLoading || !uiStringsData) {
      return;
    }

    i18next.addResourceBundle(currentLanguageCode, DEFAULT_I18NEXT_NAMESPACE, {
      ...uiStringsData,
    });

    void i18next.changeLanguage(currentLanguageCode);
  }, [currentLanguageCode, isUiStringsLoading, uiStringsData]);

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
        availableLanguages: availableLanguagesQuery.data,
        currentLanguageCode,
        i18next,
        setLanguage,
        translationFunction,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
