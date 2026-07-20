import { z } from 'zod/v4';

/* IETF language tags for supported VxSuite languages.  */
export enum LanguageCode {
  ARABIC = 'ar',
  BENGALI = 'bn',
  CHINESE_SIMPLIFIED = 'zh-Hans',
  CHINESE_TRADITIONAL = 'zh-Hant',
  ENGLISH = 'en',
  HINDI = 'hi',
  JAPANESE = 'ja-JP',
  KHMER = 'km',
  KOREAN = 'ko',
  SPANISH = 'es-US',
  TAGALOG = 'fil',
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

export const IS_RTL: Record<LanguageCode, boolean> = {
  [LanguageCode.ARABIC]: true,
  [LanguageCode.BENGALI]: false,
  [LanguageCode.CHINESE_SIMPLIFIED]: false,
  [LanguageCode.CHINESE_TRADITIONAL]: false,
  [LanguageCode.ENGLISH]: false,
  [LanguageCode.HINDI]: false,
  [LanguageCode.JAPANESE]: false,
  [LanguageCode.KHMER]: false,
  [LanguageCode.KOREAN]: false,
  [LanguageCode.SPANISH]: false,
  [LanguageCode.TAGALOG]: false,
  [LanguageCode.VIETNAMESE]: false,
};
