import { z } from 'zod';
import { Dictionary } from './generic';
import { LanguageCode } from './language_code';

/**
 * Map of UI string key to related translation in a given language.
 *
 * Follows i18next key schema and supports one level of nesting.
 * See: https://www.i18next.com/misc/json-format
 */
export type UiStringTranslations = Dictionary<string | Dictionary<string>>;

/**
 * Map of UI string key to related translation in a given language.
 *
 * Follows i18next key schema and supports one level of nesting.
 * See: https://www.i18next.com/misc/json-format
 */
export const UiStringTranslationsSchema: z.ZodType<UiStringTranslations> =
  z.record(z.union([z.string(), z.record(z.string())]));

/**
 * Map of language code to {@link UiStringTranslations}.
 */
export type UiStringsPackage = Partial<
  Record<LanguageCode, UiStringTranslations>
>;

/**
 * Map of language code to {@link UiStringTranslations}.
 */
export const UiStringsPackageSchema: z.ZodType<UiStringsPackage> = z.record(
  z.nativeEnum(LanguageCode),
  UiStringTranslationsSchema
);
