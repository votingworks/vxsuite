import { z } from 'zod/v4';

/* IETF language tags for supported VxSuite languages.  */
export enum LanguageCode {
  ARABIC = 'ar',
  BENGALI = 'bn',
  CHINESE_SIMPLIFIED = 'zh-Hans',
  CHINESE_TRADITIONAL = 'zh-Hant',
  ENGLISH = 'en',
  SPANISH = 'es-US',
}

export const LanguageCodeSchema: z.ZodType<LanguageCode> = z.enum(LanguageCode);

export type NonEnglishLanguageCode = Exclude<
  LanguageCode,
  LanguageCode.ENGLISH
>;

export function isLanguageCode(value: string): value is LanguageCode {
  return Object.values(LanguageCode).includes(value as LanguageCode);
}

/**
 * Languages written in a non-Latin script, for which proper names (e.g.
 * candidate names) are phonetically transliterated rather than kept in
 * English.
 */
export const NEEDS_TRANSLITERATED_NAMES: Record<LanguageCode, boolean> = {
  [LanguageCode.ARABIC]: false,
  [LanguageCode.BENGALI]: false,
  [LanguageCode.CHINESE_SIMPLIFIED]: true,
  [LanguageCode.CHINESE_TRADITIONAL]: true,
  [LanguageCode.ENGLISH]: false,
  [LanguageCode.SPANISH]: false,
};
