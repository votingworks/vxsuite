import { z } from 'zod';

/* ISO 639-1 codes for supported VxSuite languages.  */
export enum LanguageCode {
  CHINESE = 'zh',
  ENGLISH = 'en',
  SPANISH = 'es',
}

export const LanguageCodeSchema: z.ZodType<LanguageCode> =
  z.nativeEnum(LanguageCode);
