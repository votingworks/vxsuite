import { LanguageCode, NonEnglishLanguageCode } from '@votingworks/types';

export type TranslationOverrides = Record<
  NonEnglishLanguageCode,
  { [englishText: string]: string | undefined }
>;

/**
 * Cloud translations are sometimes incorrect and need to be globally overridden.
 */
export const GLOBAL_TRANSLATION_OVERRIDES: TranslationOverrides = {
  [LanguageCode.CHINESE_SIMPLIFIED]: {},
  [LanguageCode.CHINESE_TRADITIONAL]: {},
  [LanguageCode.SPANISH]: {
    'Green Party': 'Partido Verde',
  },
};
