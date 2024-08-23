import { z } from 'zod';
import { NonEnglishLanguageCode, safeParse } from '@votingworks/types';

import vendoredTranslations from './vendored_translations.json';

export type VendoredTranslations = Record<
  NonEnglishLanguageCode,
  { [englishText: string]: string }
>;

const VendoredTranslationsSchema: z.ZodSchema<VendoredTranslations> = z.object({
  'es-US': z.record(z.string()),
  'zh-Hans': z.record(z.string()),
  'zh-Hant': z.record(z.string()),
});

export function parseVendoredTranslations(): VendoredTranslations {
  return safeParse(
    VendoredTranslationsSchema,
    vendoredTranslations
  ).unsafeUnwrap();
}
