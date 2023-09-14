import { z } from 'zod';

import { LanguageCode } from './language_code';

/**
 * A single audio clip record in the audio clips JSONL file in a ballot package.
 */
export interface UiStringAudioClip {
  data: string;
  key: string;
  lang: LanguageCode;
}

/**
 * A single audio clip record in the audio clips JSONL file in a ballot package.
 */
export const UiStringAudioClipJsonSchema: z.ZodType<UiStringAudioClip> =
  z.object({
    data: z.string(),
    key: z.string(),
    lang: z.nativeEnum(LanguageCode),
  });

/**
 * Audio clip records from the audio clips JSONL file in a ballot package.
 */
export type UiStringAudioClips = readonly UiStringAudioClip[];
