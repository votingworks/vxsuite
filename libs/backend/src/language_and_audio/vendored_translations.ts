import { z } from 'zod';
import {
  safeParse,
  NonEnglishLanguageCode,
  LanguageCode,
} from '@votingworks/types';

import vendoredTranslations from './vendored_translations.json';

/**
 * A mapping of non-English language codes to translations of English text.
 */
export type VendoredTranslations = Record<
  NonEnglishLanguageCode,
  { [englishText: string]: string }
>;

const VendoredTranslationsSchema: z.ZodSchema<VendoredTranslations> = z.object({
  [LanguageCode.CHINESE_SIMPLIFIED]: z.record(z.string()),
  [LanguageCode.CHINESE_TRADITIONAL]: z.record(z.string()),
  [LanguageCode.SPANISH]: z.record(z.string()),
});

/**
 * Parse the vendored translations from the JSON file.
 */
export function parseVendoredTranslations(): VendoredTranslations {
  return safeParse(
    VendoredTranslationsSchema,
    vendoredTranslations
  ).unsafeUnwrap();
}
