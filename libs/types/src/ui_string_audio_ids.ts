import { z } from 'zod/v4';

import { Dictionary } from './generic';

const AudioIdListSchema = z.array(z.string());

/**
 * Map of UI string key to a sequence of related speech audio clip IDs.
 *
 * Follows i18next JSON schema and supports one level of nesting.
 * See: https://www.i18next.com/misc/json-format
 */
export const UiStringAudioIdsSchema = z.record(
  z.string(),
  z.union([AudioIdListSchema, z.record(z.string(), AudioIdListSchema)])
);

export interface UiStringAudioIds
  extends z.infer<typeof UiStringAudioIdsSchema> {}

/**
 * Map of language code to {@link UiStringAudioIds}.
 */
export const UiStringAudioIdsPackageSchema = z.record(
  z.string(),
  UiStringAudioIdsSchema
);

export interface UiStringAudioIdsPackage
  extends z.infer<typeof UiStringAudioIdsPackageSchema> {}
