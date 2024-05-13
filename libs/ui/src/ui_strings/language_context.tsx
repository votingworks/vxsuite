import React from 'react';
import i18next, { i18n } from 'i18next';
import { initReactI18next, useSSR, useTranslation } from 'react-i18next';

import { LanguageCode, UiStringsPackage } from '@votingworks/types';
import { Optional, assert, assertDefined } from '@votingworks/basics';
import { Screen } from '../screen';
import { UiStringsReactQueryApi } from '../hooks/ui_strings_api';

export const DEFAULT_LANGUAGE_CODE = LanguageCode.ENGLISH;
export const DEFAULT_I18NEXT_NAMESPACE = 'translation';

export interface BackendLanguageContextInterface {
  currentLanguageCode: LanguageCode;
  i18next: i18n;
  translationFunction: ReturnType<typeof useTranslation>['t'];
}

export interface FrontendLanguageContextInterface {
  api: UiStringsReactQueryApi;
  availableLanguages: LanguageCode[];
  currentLanguageCode: LanguageCode;
  i18next: i18n;
  setLanguage: (code: LanguageCode) => void;
  translationFunction: ReturnType<typeof useTranslation>['t'];
}

export type LanguageContextInterface =
  | (FrontendLanguageContextInterface & { executionContext: 'frontend' })
  | (BackendLanguageContextInterface & { executionContext: 'backend' });

export const LanguageContext =
  React.createContext<Optional<LanguageContextInterface>>(undefined);

export function useLanguageContext(): Optional<LanguageContextInterface> {
  return React.useContext(LanguageContext);
}

export function useFrontendLanguageContext(): Optional<FrontendLanguageContextInterface> {
  const languageContext = React.useContext(LanguageContext);
  if (!languageContext) return undefined;

  assert(languageContext.executionContext === 'frontend');
  return languageContext;
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
    useFrontendLanguageContext(),
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

export interface FrontendLanguageContextProviderProps {
  api: UiStringsReactQueryApi;
  children: React.ReactNode;
}

export function FrontendLanguageContextProvider(
  props: FrontendLanguageContextProviderProps
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
        executionContext: 'frontend',
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

export interface BackendLanguageContextProviderProps {
  currentLanguageCode: LanguageCode;
  uiStringsPackage: UiStringsPackage;
  children: React.ReactNode;
}

export function BackendLanguageContextProvider({
  currentLanguageCode,
  uiStringsPackage,
  children,
}: BackendLanguageContextProviderProps): JSX.Element {
  // Although you can pass an initial i18n store to  `useSSR`, it only
  // sets the i18n store on the very first render. For example, if you have
  // a machine configured with a UI strings catalog, unconfigure, then reconfigure,
  // i18n will not be re-initialize with the the new initial i18n store.
  // Thus, we just need to add a resource bundle on every render.
  useSSR({}, currentLanguageCode);
  for (const [languageCode, uiStringTranslations] of Object.entries(
    uiStringsPackage
  )) {
    i18next.addResourceBundle(
      languageCode,
      DEFAULT_I18NEXT_NAMESPACE,
      uiStringTranslations
    );
  }

  const { t: translationFunction } = i18next;

  return (
    <LanguageContext.Provider
      value={{
        executionContext: 'backend',
        currentLanguageCode,
        i18next,
        translationFunction,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
