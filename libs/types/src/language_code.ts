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

export const ORDERED_LANGUAGE_CODES = Object.values(LanguageCode).sort(
  /* istanbul ignore next */
  (a, b) => {
    if (a === LanguageCode.ENGLISH) return -1;
    if (b === LanguageCode.ENGLISH) return 1;
    return a.localeCompare(b);
  }
);

export type NonEnglishLanguageCode = Exclude<
  LanguageCode,
  LanguageCode.ENGLISH
>;

export function isLanguageCode(value: string): value is LanguageCode {
  return Object.values(LanguageCode).includes(value as LanguageCode);
}

export const IS_RTL: Record<LanguageCode, boolean> = {
  [LanguageCode.ARABIC]: true,
  [LanguageCode.BENGALI]: false,
  [LanguageCode.CHINESE_SIMPLIFIED]: false,
  [LanguageCode.CHINESE_TRADITIONAL]: false,
  [LanguageCode.ENGLISH]: false,
  [LanguageCode.SPANISH]: false,
};
