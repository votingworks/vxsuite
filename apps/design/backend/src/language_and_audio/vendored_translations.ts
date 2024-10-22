import { z } from 'zod';
import { safeParse } from '@votingworks/types';

import vendoredTranslations from './vendored_translations.json';
import { NonEnglishLanguageCode, LanguageCode } from '../language_code';

export type VendoredTranslations = Record<
  NonEnglishLanguageCode,
  { [englishText: string]: string }
>;

const VendoredTranslationsSchema: z.ZodSchema<VendoredTranslations> = z.object({
  [LanguageCode.CHINESE_SIMPLIFIED]: z.record(z.string()),
  [LanguageCode.CHINESE_TRADITIONAL]: z.record(z.string()),
  [LanguageCode.SPANISH]: z.record(z.string()),
});

export function parseVendoredTranslations(): VendoredTranslations {
  return safeParse(
    VendoredTranslationsSchema,
    vendoredTranslations
  ).unsafeUnwrap();
}
