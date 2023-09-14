import { z } from 'zod';

import { Dictionary } from './generic';
import { LanguageCode } from './language_code';

type AudioKeyList = string[];

/**
 * Map of UI string key to a sequence of related speech audio clip keys.
 *
 * Follows i18next key schema and supports one level of nesting.
 * See: https://www.i18next.com/misc/json-format
 */
export type UiStringAudioKeys = Dictionary<
  AudioKeyList | Dictionary<AudioKeyList>
>;

const AudioKeyListSchema: z.ZodType<AudioKeyList> = z.array(z.string());

/**
 * Map of UI string key to a sequence of related speech audio clip keys.
 *
 * Follows i18next key schema and supports one level of nesting.
 * See: https://www.i18next.com/misc/json-format
 */
export const UiStringAudioKeysSchema: z.ZodType<UiStringAudioKeys> = z.record(
  z.union([AudioKeyListSchema, z.record(AudioKeyListSchema)])
);

/**
 * Map of language code to {@link UiStringAudioKeys}.
 */
export type UiStringAudioKeysPackage = Partial<
  Record<LanguageCode, UiStringAudioKeys>
>;

/**
 * Map of language code to {@link UiStringAudioKeys}.
 */
export const UiStringAudioKeysPackageSchema: z.ZodType<UiStringAudioKeysPackage> =
  z.record(z.nativeEnum(LanguageCode), UiStringAudioKeysSchema);
