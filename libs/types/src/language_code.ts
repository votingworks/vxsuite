import { z } from 'zod';

/* IETF language tags for supported VxSuite languages.  */
export enum LanguageCode {
  CHINESE_SIMPLIFIED = 'zh-Hans',
  CHINESE_TRADITIONAL = 'zh-Hant',
  ENGLISH = 'en',
  SPANISH = 'es-US',
}

export const LanguageCodeSchema: z.ZodType<LanguageCode> =
  z.nativeEnum(LanguageCode);

export type NonEnglishLanguageCode = Exclude<
  LanguageCode,
  LanguageCode.ENGLISH
>;

export function isLanguageCode(value: string): value is LanguageCode {
  return Object.values(LanguageCode).includes(value as LanguageCode);
}
