import type { EnumValues } from '@votingworks/basics';

export const TestLanguageCode = {
  CHINESE_SIMPLIFIED: 'zh-Hans',
  CHINESE_TRADITIONAL: 'zh-Hant',
  ENGLISH: 'en',
  SPANISH: 'es-US',
} as const;
export type TestLanguageCode = EnumValues<typeof TestLanguageCode>;
