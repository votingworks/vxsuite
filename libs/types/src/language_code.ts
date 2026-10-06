import type { EnumValues } from '@votingworks/basics';
import { z } from 'zod/v4';

/* IETF language tags for supported VxSuite languages.  */
export const LanguageCode = {
  ARABIC: 'ar',
  BENGALI: 'bn',
  CHINESE_SIMPLIFIED: 'zh-Hans',
  CHINESE_TRADITIONAL: 'zh-Hant',
  ENGLISH: 'en',
  SPANISH: 'es-US',
} as const;

/* IETF language tags for supported VxSuite languages.  */
export type LanguageCode = EnumValues<typeof LanguageCode>;

export const LanguageCodeSchema = z.enum(LanguageCode);

export type NonEnglishLanguageCode = Exclude<
  LanguageCode,
  typeof LanguageCode.ENGLISH
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
