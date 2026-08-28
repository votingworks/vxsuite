import { z } from 'zod/v4';

/* IETF language tags for supported VxSuite languages.  */
export enum LanguageCode {
  ARABIC = 'ar',
  BENGALI = 'bn',
  CHINESE_SIMPLIFIED = 'zh-Hans',
  CHINESE_TRADITIONAL = 'zh-Hant',
  ENGLISH = 'en',
  HINDI = 'hi',
  HMONG = 'hmn',
  JAPANESE = 'ja-JP',
  KHMER = 'km',
  KOREAN = 'ko',
  RUSSIAN = 'ru',
  SPANISH = 'es-US',
  TAGALOG = 'fil',
  URDU = 'ur',
  VIETNAMESE = 'vi',
}

export const LanguageCodeSchema: z.ZodType<LanguageCode> = z.enum(LanguageCode);

export type NonEnglishLanguageCode = Exclude<
  LanguageCode,
  LanguageCode.ENGLISH
>;

export const NonEnglishLanguageCodeSchema: z.ZodType<NonEnglishLanguageCode> = z
  .enum(LanguageCode)
  .exclude(['ENGLISH']);

export function isLanguageCode(value: string): value is LanguageCode {
  return Object.values(LanguageCode).includes(value as LanguageCode);
}

/**
 * Languages for which proper names (e.g. candidate names) should be
 * phonetically transliterated into the language's script rather than kept in
 * English.
 */
export const NEEDS_TRANSLITERATED_NAMES: Record<LanguageCode, boolean> = {
  [LanguageCode.ARABIC]: false,
  [LanguageCode.BENGALI]: false,
  [LanguageCode.CHINESE_SIMPLIFIED]: true,
  [LanguageCode.CHINESE_TRADITIONAL]: true,
  [LanguageCode.ENGLISH]: false,
  [LanguageCode.HINDI]: true,
  [LanguageCode.HMONG]: false,
  [LanguageCode.JAPANESE]: true,
  [LanguageCode.KHMER]: true,
  [LanguageCode.KOREAN]: true,
  [LanguageCode.RUSSIAN]: false,
  [LanguageCode.SPANISH]: false,
  [LanguageCode.TAGALOG]: false,
  [LanguageCode.URDU]: false,
  [LanguageCode.VIETNAMESE]: false,
};

export const IS_RTL: Record<LanguageCode, boolean> = {
  [LanguageCode.ARABIC]: true,
  [LanguageCode.BENGALI]: false,
  [LanguageCode.CHINESE_SIMPLIFIED]: false,
  [LanguageCode.CHINESE_TRADITIONAL]: false,
  [LanguageCode.ENGLISH]: false,
  [LanguageCode.HINDI]: false,
  [LanguageCode.HMONG]: false,
  [LanguageCode.JAPANESE]: false,
  [LanguageCode.KHMER]: false,
  [LanguageCode.KOREAN]: false,
  [LanguageCode.RUSSIAN]: false,
  [LanguageCode.SPANISH]: false,
  [LanguageCode.TAGALOG]: false,
  [LanguageCode.URDU]: true,
  [LanguageCode.VIETNAMESE]: false,
};
