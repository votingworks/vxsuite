import {
  DEFAULT_LANGUAGE_CODE,
  useLanguageContext,
} from '../ui_strings/language_context';

export function useCurrentLanguage(): string {
  return useLanguageContext()?.currentLanguageCode || DEFAULT_LANGUAGE_CODE;
}
