import React from 'react';
import i18next, { InitOptions, i18n } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { UiStringsPackage } from '@votingworks/types';
import {
  Optional,
  assert,
  assertDefined,
  mapObject,
} from '@votingworks/basics';
import { Screen } from '../screen';
import { UiStringsReactQueryApi } from '../hooks/ui_strings_api';

export const DEFAULT_LANGUAGE_CODE = 'en';
export const DEFAULT_I18NEXT_NAMESPACE = 'translation';

export interface BackendLanguageContextInterface {
  currentLanguageCode: string;
  i18next: i18n;
  translationFunction: ReturnType<typeof useTranslation>['t'];
}

export interface FrontendLanguageContextInterface {
  api: UiStringsReactQueryApi;
  availableLanguages: string[];
  currentLanguageCode: string;
  i18next: i18n;
  setLanguage: (code: string) => void;
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

const i18NextOptions: InitOptions = {
  lng: DEFAULT_LANGUAGE_CODE,
  interpolation: {
    escapeValue: false, // Sanitization already handled by React.
  },
  react: {
    // Configure events that trigger re-renders:
    bindI18n: 'languageChanged loaded',
    bindI18nStore: 'added removed',
  },
};

const i18nextInitPromise = i18next.use(initReactI18next).init(i18NextOptions);

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
    if (!languageCode || isLoading) {
      return;
    }

    // Clear the i18next cache whenever the translation data in the backend is
    // empty (e.g. after unconfiguring a previous election, or switching to an
    // election with no translations).
    if (!data) {
      i18next.removeResourceBundle(languageCode, DEFAULT_I18NEXT_NAMESPACE);
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
  currentLanguageCode: string;
  uiStringsPackage: UiStringsPackage;
  children: React.ReactNode;
}

export function BackendLanguageContextProvider({
  currentLanguageCode,
  uiStringsPackage,
  children,
}: BackendLanguageContextProviderProps): JSX.Element {
  const i18nextInstance = i18next
    .createInstance({
      ...i18NextOptions,
      lng: currentLanguageCode,
      resources: mapObject(uiStringsPackage, (translations) => ({
        [DEFAULT_I18NEXT_NAMESPACE]: translations,
      })),
    })
    .use(initReactI18next);
  // Since we have already loaded the translation resources and are passing
  // them in explicitly above, we can set initImmediate to false to tell i18next to
  // initialize synchronously. However, we still need to deal with the Promise
  // returned by init(), but it will never reject so it's safe to ignore.
  void i18nextInstance.init({ initImmediate: false });

  return (
    <LanguageContext.Provider
      value={{
        executionContext: 'backend',
        currentLanguageCode,
        i18next: i18nextInstance,
        translationFunction: i18nextInstance.t,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
