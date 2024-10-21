import {
  DEFAULT_LANGUAGE_CODE,
  useFrontendLanguageContext,
} from '../ui_strings/language_context';

export function useAvailableLanguages(): string[] {
  return (
    useFrontendLanguageContext()?.availableLanguages || [DEFAULT_LANGUAGE_CODE]
  );
}
