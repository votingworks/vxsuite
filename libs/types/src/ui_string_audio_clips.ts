import { z } from 'zod/v4';

/**
 * A single audio clip record in the audio clips JSONL file in an election package.
 */
export const UiStringAudioClipSchema = z.object({
  dataBase64: z.string(),
  id: z.string(),
  languageCode: z.string(),
});

export interface UiStringAudioClip
  extends z.infer<typeof UiStringAudioClipSchema> {}

/**
 * Audio clip records from the audio clips JSONL file in an election package.
 */
export type UiStringAudioClips = readonly UiStringAudioClip[];
