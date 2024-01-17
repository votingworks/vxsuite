import { LanguageCode } from '@votingworks/types';

import {
  DEFAULT_LANGUAGE_CODE,
  useLanguageContext,
} from '../ui_strings/language_context';

export function useAvailableLanguages(): LanguageCode[] {
  return useLanguageContext()?.availableLanguages || [DEFAULT_LANGUAGE_CODE];
}
