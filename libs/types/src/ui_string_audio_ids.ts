import { z } from 'zod';

import { Dictionary } from './generic';

type AudioIdList = string[];

/**
 * Map of UI string key to a sequence of related speech audio clip IDs.
 *
 * Follows i18next JSON schema and supports one level of nesting.
 * See: https://www.i18next.com/misc/json-format
 */
export type UiStringAudioIds = Dictionary<
  AudioIdList | Dictionary<AudioIdList>
>;

const AudioIdListSchema: z.ZodType<AudioIdList> = z.array(z.string());

/**
 * Map of UI string key to a sequence of related speech audio clip IDs.
 *
 * Follows i18next JSON schema and supports one level of nesting.
 * See: https://www.i18next.com/misc/json-format
 */
export const UiStringAudioIdsSchema: z.ZodType<UiStringAudioIds> = z.record(
  z.union([AudioIdListSchema, z.record(AudioIdListSchema)])
);

/**
 * Map of language code to {@link UiStringAudioIds}.
 */
export interface UiStringAudioIdsPackage {
  [key: string]: UiStringAudioIds;
}

/**
 * Map of language code to {@link UiStringAudioIds}.
 */
export const UiStringAudioIdsPackageSchema: z.ZodType<UiStringAudioIdsPackage> =
  z.record(z.string(), UiStringAudioIdsSchema);
