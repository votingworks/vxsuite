import { z } from 'zod/v4';

import { ElectionStringKey } from './ui_string_translations';
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
export interface PhoneticSyllable {
  ipaPhonemes: IpaPhoneme[];
  stress?: PhoneticSyllableStress;
}

export const PhoneticSyllableSchema: z.ZodType<PhoneticSyllable> = z.object({
  ipaPhonemes: z.array(IpaPhonemeSchema),
  stress: z.enum(['primary']).optional(),
});

/**
 * Represents a single word in a TTS string. The phonetic editor operates on a
 * per-word basis. Words are naïvely split out by whitespace from the original
 * user-entered election strings.
 */
export interface PhoneticWord {
  syllables?: PhoneticSyllable[];
  text: string;
}

export const PhoneticWordSchema: z.ZodType<PhoneticWord> = z.object({
  syllables: z.array(PhoneticSyllableSchema).optional(),
  text: z.string(),
});

export const PhoneticWordsSchema = z.array(PhoneticWordSchema);

/**
 * Unique key identifying a given TTS string in storage.
 */
export interface TtsStringKey {
  electionId: string;
  key: ElectionStringKey;
  languageCode: string;
  subkey?: string;
}

export const TtsStringKeySchema: z.ZodType<TtsStringKey> = z.object({
  electionId: z.string(),
  key: z.enum(ElectionStringKey),
  languageCode: z.string(),
  subkey: z.string().optional(),
});

const ExportSourceSchema = z.enum(['phonetic', 'text']);

/**
 * Determines which type of input to use when generating election audio for
 * export (plain text, vs phonetic).
 */
export type TtsExportSource = z.infer<typeof ExportSourceSchema>;

/**
 * Speech synthesis inputs for a given election string.
 */
export interface TtsString {
  exportSource: TtsExportSource;
  phonetic: PhoneticWord[];
  text: string;
}

export const TtsStringSchema: z.ZodType<TtsString> = z.object({
  exportSource: ExportSourceSchema,
  phonetic: z.array(PhoneticWordSchema),
  text: z.string(),
});
