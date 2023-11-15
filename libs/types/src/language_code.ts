import { z } from 'zod';

/* IETF language tags for supported VxSuite languages.  */
export enum LanguageCode {
  CHINESE_SIMPLIFIED = 'zh-HANS',
  CHINESE_TRADITIONAL = 'zh-HANT',
  ENGLISH = 'en',
  SPANISH = 'es-US',
}

export const LanguageCodeSchema: z.ZodType<LanguageCode> =
  z.nativeEnum(LanguageCode);
