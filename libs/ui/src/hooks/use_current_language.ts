import { LanguageCode } from '@votingworks/types';
import {
  DEFAULT_LANGUAGE_CODE,
  useLanguageContext,
} from '../ui_strings/language_context';

export function useCurrentLanguage(): LanguageCode {
  return useLanguageContext()?.currentLanguageCode || DEFAULT_LANGUAGE_CODE;
}
