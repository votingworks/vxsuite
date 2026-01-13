import { z } from 'zod/v4';

import {
  IpaPhoneme,
  IpaPhonemeSchema,
  PhoneticSyllableStress,
} from './tts_phonemes';

/**
 * Loosely represents a distinct syllable in a word, to which stress can be
 * added to influence emphasis in synthesized speech.
 *
 * "Loosely", because a `PhoneticSyllable` may actually encompass multiple
 * syllables if no stress is needed, or a single stress at the start of the word
 * is sufficient. Syllable splits are up to the user.
 */
export const PhoneticSyllableSchema = z.object({
  ipaPhonemes: z.array(IpaPhonemeSchema),
  stress: z.enum(['primary']).optional(),
});

export interface PhoneticSyllable
  extends z.infer<typeof PhoneticSyllableSchema> {}

/**
 * Represents a single word in a TTS string. The phonetic editor operates on a
 * per-word basis. Words are naïvely split out by whitespace from the original
 * user-entered election strings.
 */
export const PhoneticWordSchema = z.object({
  syllables: z.array(PhoneticSyllableSchema).optional(),
  text: z.string(),
});

export interface PhoneticWord extends z.infer<typeof PhoneticWordSchema> {}

export const PhoneticWordsSchema = z.array(PhoneticWordSchema);

/**
 * Unique key identifying user edits for a given TTS string in storage.
 */
export const TtsEditKeySchema = z.object({
  languageCode: z.string(),
  jurisdictionId: z.string(),
  original: z.string(),
});

export interface TtsEditKey extends z.infer<typeof TtsEditKeySchema> {}

const ExportSourceSchema = z.enum(['phonetic', 'text']);

/**
 * Determines which type of input to use when generating election audio for
 * export (plain text, vs phonetic).
 */
export type TtsExportSource = z.infer<typeof ExportSourceSchema>;

/**
 * Speech synthesis edits for a given election string.
 */
export const TtsEditSchema = z.object({
  exportSource: ExportSourceSchema,
  phonetic: z.array(PhoneticWordSchema),
  text: z.string(),
});

export interface TtsEdit extends z.infer<typeof TtsEditSchema> {}

/**
 * TTS user edits and metadata for a language-specific string.
 */
export type TtsEditEntry = TtsEdit & {
  original: string;
  languageCode: string;
};

/**
 * TTS input and metadata for a single `UiString`.
 */
export type UiStringTtsInput = TtsEdit & {
  key: string | [string, string];
  languageCode: string;
};
