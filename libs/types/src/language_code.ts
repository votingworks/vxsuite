import { z } from 'zod';

/* ISO IETF language tags for supported VxSuite languages.  */
export enum LanguageCode {
  CHINESE_SIMPLIFIED = 'zh-HANS',
  CHINESE_TRADITIONAL = 'zh-HANT',
  ENGLISH = 'en',
  SPANISH = 'es-419', // Default to Latin-American Spanish, since that's more common in the US.
}

export const LanguageCodeSchema: z.ZodType<LanguageCode> =
  z.nativeEnum(LanguageCode);
