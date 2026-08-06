import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import {
  safeParse,
  NonEnglishLanguageCode,
  LanguageCode,
} from '@votingworks/types';


/**
 * A mapping of non-English language codes to translations of English text.
 */
export type VendoredTranslations = Record<
  NonEnglishLanguageCode,
  { [englishText: string]: string }
>;

const VendoredTranslationsSchema: z.ZodSchema<VendoredTranslations> = z.object({
  [LanguageCode.ARABIC]: z.record(z.string(), z.string()),
  [LanguageCode.BENGALI]: z.record(z.string(), z.string()),
  [LanguageCode.CHINESE_SIMPLIFIED]: z.record(z.string(), z.string()),
  [LanguageCode.CHINESE_TRADITIONAL]: z.record(z.string(), z.string()),
  [LanguageCode.SPANISH]: z.record(z.string(), z.string()),
});

/**
 * Parse the vendored translations from the JSON file.
 */
export function parseVendoredTranslations(): VendoredTranslations {
  // Read rather than imported: a JSON import needs an import attribute, which
  // NodeJS requires and tsc only allows above `module: node16` — and which
  // Babel, used to run the integration tests, cannot parse at all.
  const vendoredTranslations = JSON.parse(
    readFileSync(join(import.meta.dirname, 'vendored_translations.json'), 'utf8')
  );

  return safeParse(
    VendoredTranslationsSchema,
    vendoredTranslations
  ).unsafeUnwrap();
}
