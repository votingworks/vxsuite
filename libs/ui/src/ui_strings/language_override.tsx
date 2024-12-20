import React from 'react';
import {
  LanguageContext,
  useLanguageContext,
  UiStringsLoader,
} from './language_context';

export interface LanguageOverrideProps {
  children: React.ReactNode;
  languageCode: string;
}

/**
 * Renders the given child elements with all translatable strings translated to
 * the specified language, regardless of the currently active app-wide language
 * setting.
 *
 * NOTE: This will also affect the audio language, when voter audio is enabled.
 */
export function LanguageOverride(
  props: LanguageOverrideProps
): React.ReactNode {
  const { children, languageCode } = props;

  const parentContext = useLanguageContext();
  if (!parentContext) {
    return children;
  }

  return (
    <LanguageContext.Provider
      value={{
        ...parentContext,
        currentLanguageCode: languageCode,
      }}
    >
      {parentContext.executionContext === 'frontend' && <UiStringsLoader />}
      {children}
    </LanguageContext.Provider>
  );
}

export function InEnglish(props: { children: React.ReactNode }): JSX.Element {
  return <LanguageOverride {...props} languageCode="en" />;
}
