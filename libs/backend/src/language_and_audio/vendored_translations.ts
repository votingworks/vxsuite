import { z } from 'zod/v4';
import {
  safeParse,
  NonEnglishLanguageCode,
  NonEnglishLanguageCodeSchema,
} from '@votingworks/types';

import vendoredTranslations from './vendored_translations.json';

/**
 * A mapping of non-English language codes to translations of English text.
 */
export type VendoredTranslations = Partial<
  Record<NonEnglishLanguageCode, { [englishText: string]: string }>
>;

const VendoredTranslationsSchema: z.ZodSchema<VendoredTranslations> = z.record(
  NonEnglishLanguageCodeSchema,
  z.record(z.string(), z.string()).optional()
);

/**
 * Parse the vendored translations from the JSON file.
 */
export function parseVendoredTranslations(): VendoredTranslations {
  return safeParse(
    VendoredTranslationsSchema,
    vendoredTranslations
  ).unsafeUnwrap();
}
