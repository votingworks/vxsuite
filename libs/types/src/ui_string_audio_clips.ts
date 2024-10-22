import { z } from 'zod';

/**
 * A single audio clip record in the audio clips JSONL file in an election package.
 */
export interface UiStringAudioClip {
  dataBase64: string;
  id: string;
  languageCode: string;
}

/**
 * A single audio clip record in the audio clips JSONL file in an election package.
 */
export const UiStringAudioClipSchema: z.ZodType<UiStringAudioClip> = z.object({
  dataBase64: z.string(),
  id: z.string(),
  languageCode: z.string(),
});

/**
 * Audio clip records from the audio clips JSONL file in an election package.
 */
export type UiStringAudioClips = readonly UiStringAudioClip[];
